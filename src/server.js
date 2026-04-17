
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { exec } = require("child_process");
const fs = require("fs");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve your frontend pages
app.use(express.static(path.join(__dirname, '../client/pages')));
app.use('/images', express.static(path.join(__dirname, '../client/images')));

// ---- MongoDB Connection ----
mongoose.connect('mongodb+srv://siddharthmishra10e_db_user:Unravel01@cluster0.scaxg1g.mongodb.net/?appName=Cluster0')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB error:', err));
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

app.post("/run", (req, res) => {
    const code = req.body.code;

    fs.writeFileSync("temp.cpp", code);

    exec("g++ temp.cpp -o temp.exe", (compileErr, _, compileStderr) => {
        if (compileErr) {
            return res.json({ error: compileStderr });
        }

        exec("temp.exe", (runErr, stdout, stderr) => {
            if (runErr) {
                return res.json({ error: stderr });
            }

            res.json({ output: stdout });
        });
    });
});


// ---- Start Server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));