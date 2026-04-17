// =============================================
// PASTE THIS INTO YOUR EXISTING server.js
// =============================================
// Required installs (run in /src):
// npm install express mongoose bcryptjs cors

require('dotenv').config();

// console.log("ENV CHECK:", process.env.MONGODB_URI);
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
// require('dotenv').config();
// Middleware
app.use(cors());
app.use(express.json());
// app.use(express.static('client/pages'));
app.use(express.static(path.join(__dirname, '../client/pages')));

// Serve your frontend pages
app.use(express.static(path.join(__dirname, '../client/pages')));
app.use('/images', express.static(path.join(__dirname, '../client/images')));

// ---- MongoDB Connection ----
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB error:', err));
// console.log("Mongo URI:", process.env.MONGODB_URI);

// ---- User Schema ----
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // null for Google users
    provider: { type: String, default: 'email' }, // 'email' or 'google'
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ---- SIGNUP Route ----
app.post('/api/auth/signup', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        // Check if user already exists
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Hash password
        const hashed = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({ name, email, password: hashed, provider: 'email' });

        res.status(201).json({ name: user.name, email: user.email });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ---- LOGIN Route ----
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'No account found with this email' });
        }

        if (user.provider === 'google') {
            return res.status(400).json({ message: 'This email is registered with Google. Use Google Sign-in.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect password' });
        }

        res.status(200).json({ name: user.name, email: user.email });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ---- Start Server ----
const PORT = process.env.PORT || 3000;

// ---- CODE ANALYZER LOGIC ----
app.post('/api/analyze', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ message: "No code provided" });
    }

    try {
        const lines = code.split('\n');

        let currentDepth = 0;
        let maxDepth = 0;
        let hasRecursion = false;
        let hasLogN = false;

        // detect function name
        const funcMatch = code.match(/(int|void|float|double|string)\s+(\w+)\s*\(/);
        const functionName = funcMatch ? funcMatch[2] : null;

        for (let line of lines) {
            line = line.trim();

            // LOOP DETECTION
            if (line.startsWith("for") || line.startsWith("while")) {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);

                // detect log n pattern (i = i/2 or i *= 2)
                if (line.includes("/=") || line.includes("*=")) {
                    hasLogN = true;
                }
            }

            // BLOCK CLOSE
            if (line.includes("}")) {
                currentDepth = Math.max(0, currentDepth - 1);
            }

            

            // // RECURSION DETECTION
            // if (functionName && line.includes(functionName + "(") && !line.startsWith(functionName)) {
            //     hasRecursion = true;
            // }
            // RECURSION DETECTION (BETTER)
if (functionName) {
    const callPattern = new RegExp(`\\b${functionName}\\s*\\(`);

    if (callPattern.test(line) && !line.match(/(int|void|float|double|string)\s+\w+\s*\(/)) {
        hasRecursion = true;
    }
}
        }

        // ---- DECISION LOGIC ----
        let time = "O(1)";
        let space = "O(1)";
        let explanation = "";

        if (hasRecursion) {
            time = "O(2^n)";
            explanation = "Recursive calls detected (likely exponential).";
        }
        else if (hasLogN && maxDepth === 1) {
            time = "O(log n)";
            explanation = "Loop reduces input size (logarithmic).";
        }
        else if (hasLogN && maxDepth === 2) {
            time = "O(n log n)";
            explanation = "Nested loop with logarithmic inner loop.";
        }
        else if (maxDepth === 1) {
            time = "O(n)";
            explanation = "Single loop detected.";
        }
        else if (maxDepth === 2) {
            time = "O(n^2)";
            explanation = "Two nested loops detected.";
        }
        else if (maxDepth >= 3) {
            time = `O(n^${maxDepth})`;
            explanation = `${maxDepth} nested loops detected.`;
        }
        else {
            explanation = "No loops detected.";
        }

        const result = `
Time Complexity: ${time}
Space Complexity: ${space}
Explanation: ${explanation}
        `;

        res.json({ result });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Analysis failed" });
    }
});
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));