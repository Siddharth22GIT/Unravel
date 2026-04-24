// =============================================
// PASTE THIS INTO YOUR EXISTING server.js
// =============================================
// Required installs (run in /src):
// npm install express mongoose bcryptjs cors axios

require('dotenv').config();

// console.log("ENV CHECK:", process.env.MONGODB_URI);
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const { promisify } = require('util');
const crypto = require('crypto');

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

const submissionEntrySchema = new mongoose.Schema({
    code: { type: String, default: '' },
    results: { type: Array, default: [] },
    allPass: { type: Boolean, default: false },
    passed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    time: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const analysisEntrySchema = new mongoose.Schema({
    code: { type: String, default: '' },
    timeComplexity: { type: String, default: '' },
    spaceComplexity: { type: String, default: '' },
    explanation: { type: String, default: '' },
    time: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const workspaceStateSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    questionKey: { type: String, required: true },
    questionId: { type: Number, required: true },
    tierKey: { type: String, required: true },
    savedCode: { type: String, default: '' },
    submissionHistory: { type: [submissionEntrySchema], default: [] },
    analysisHistory: { type: [analysisEntrySchema], default: [] }
}, {
    timestamps: true
});

workspaceStateSchema.index({ userEmail: 1, questionKey: 1 }, { unique: true });

const WorkspaceState = mongoose.model('WorkspaceState', workspaceStateSchema);

function buildQuestionKey(questionId, tierKey) {
    return `${tierKey}_${questionId}`;
}

function normalizeWorkspaceState(state) {
    return {
        savedCode: state?.savedCode || '',
        submissionHistory: state?.submissionHistory || [],
        analysisHistory: state?.analysisHistory || []
    };
}

async function validateWorkspaceUser(email) {
    if (!email) return null;
    return User.findOne({ email });
}

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

app.get('/api/workspace/state', async (req, res) => {
    const { email, questionId, tierKey } = req.query;

    if (!email || !questionId || !tierKey) {
        return res.status(400).json({ message: 'email, questionId, and tierKey are required' });
    }

    try {
        const user = await validateWorkspaceUser(email);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const questionKey = buildQuestionKey(questionId, tierKey);
        const state = await WorkspaceState.findOne({ userEmail: email, questionKey }).lean();

        return res.json({
            success: true,
            state: normalizeWorkspaceState(state)
        });
    } catch (err) {
        console.error('Workspace load error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to load workspace state'
        });
    }
});

app.post('/api/workspace/state/submission', async (req, res) => {
    const { email, questionId, tierKey, code, entry } = req.body;

    if (!email || !questionId || !tierKey || !entry) {
        return res.status(400).json({ message: 'email, questionId, tierKey, and entry are required' });
    }

    try {
        const user = await validateWorkspaceUser(email);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const questionKey = buildQuestionKey(questionId, tierKey);

        await WorkspaceState.findOneAndUpdate(
            { userEmail: email, questionKey },
            {
                $set: {
                    questionId,
                    tierKey,
                    savedCode: code || '',
                    updatedAt: new Date()
                },
                $push: {
                    submissionHistory: {
                        $each: [{
                            code: entry.code || code || '',
                            results: entry.results || [],
                            allPass: Boolean(entry.allPass),
                            passed: entry.passed || 0,
                            total: entry.total || 0,
                            time: entry.time || '',
                            timestamp: entry.timestamp || new Date()
                        }],
                        $position: 0,
                        $slice: 50
                    }
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('Workspace submission save error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to save submission history'
        });
    }
});

app.post('/api/workspace/state/analysis', async (req, res) => {
    const { email, questionId, tierKey, code, entry } = req.body;

    if (!email || !questionId || !tierKey || !entry) {
        return res.status(400).json({ message: 'email, questionId, tierKey, and entry are required' });
    }

    try {
        const user = await validateWorkspaceUser(email);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const questionKey = buildQuestionKey(questionId, tierKey);

        await WorkspaceState.findOneAndUpdate(
            { userEmail: email, questionKey },
            {
                $set: {
                    questionId,
                    tierKey,
                    savedCode: code || '',
                    updatedAt: new Date()
                },
                $push: {
                    analysisHistory: {
                        $each: [{
                            code: entry.code || code || '',
                            timeComplexity: entry.timeComplexity || '',
                            spaceComplexity: entry.spaceComplexity || '',
                            explanation: entry.explanation || '',
                            time: entry.time || '',
                            timestamp: entry.timestamp || new Date()
                        }],
                        $position: 0,
                        $slice: 50
                    }
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('Workspace analysis save error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to save analysis history'
        });
    }
});

// ---- RUN C++ CODE ROUTE ----
const execAsync = promisify(exec);
const JUDGE0_BASE_URL = 'https://ce.judge0.com';
const CPP_LANGUAGE_ID = 54;
const EXECUTION_TIMEOUT_MS = 3000;
const CLEANUP_DELAY_MS = 1000;
const JUDGE0_POLL_DELAY_MS = 1000;
const JUDGE0_MAX_POLLS = 10;
const RUN_LOG_WINDOW_MS = 2000;
const recentRunLogs = new Map();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function encodeBase64(value = '') {
    return Buffer.from(String(value), 'utf8').toString('base64');
}

function decodeBase64(value) {
    if (!value) return '';

    try {
        return Buffer.from(value, 'base64').toString('utf8');
    } catch (err) {
        return value;
    }
}

function shouldLogRunBurst(code, mode) {
    const codeHash = crypto.createHash('sha1').update(String(code || '')).digest('hex');
    const key = `${mode}:${codeHash}`;
    const now = Date.now();
    const lastSeen = recentRunLogs.get(key) || 0;

    recentRunLogs.set(key, now);

    for (const [entryKey, timestamp] of recentRunLogs.entries()) {
        if (now - timestamp > RUN_LOG_WINDOW_MS) {
            recentRunLogs.delete(entryKey);
        }
    }

    return now - lastSeen > RUN_LOG_WINDOW_MS;
}

function scheduleCleanup(filePath, exePath) {
    setTimeout(() => {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            if (fs.existsSync(exePath)) fs.unlinkSync(exePath);
        } catch (err) {
            console.log('Cleanup error:', err.message);
        }
    }, CLEANUP_DELAY_MS);
}

async function runWithJudge0(code, input = '') {
    try {
        const submitResponse = await axios.post(
            `${JUDGE0_BASE_URL}/submissions?base64_encoded=true`,
            {
                source_code: encodeBase64(code),
                stdin: encodeBase64(input),
                language_id: CPP_LANGUAGE_ID
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );

        const token = submitResponse.data?.token;

        if (!token) {
            return {
                success: false,
                output: 'Judge0 did not return a submission token.'
            };
        }

        for (let attempt = 0; attempt < JUDGE0_MAX_POLLS; attempt++) {
            const resultResponse = await axios.get(
                `${JUDGE0_BASE_URL}/submissions/${token}?base64_encoded=true`,
                { timeout: 10000 }
            );

            const result = resultResponse.data;
            const statusId = result?.status?.id;

            if (statusId >= 3) {
                const output =
                    decodeBase64(result.stdout) ||
                    decodeBase64(result.stderr) ||
                    decodeBase64(result.compile_output) ||
                    result.message ||
                    'No output received.';

                return {
                    success: statusId === 3,
                    output
                };
            }

            await wait(JUDGE0_POLL_DELAY_MS);
        }

        return {
            success: false,
            output: 'Judge0 execution timed out while waiting for the result.'
        };
    } catch (err) {
        return {
            success: false,
            output:
                err.response?.data?.error ||
                err.response?.data?.message ||
                'Failed to execute code via Judge0.'
        };
    }
}

async function runLocally(code, input = '') {
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const filePath = path.join(__dirname, `temp_${uniqueId}.cpp`);
    const exePath = path.join(__dirname, `temp_${uniqueId}.exe`);

    try {
        fs.writeFileSync(filePath, code);

        await execAsync(`g++ "${filePath}" -o "${exePath}"`);

        return await new Promise((resolve) => {
            const runProcess = exec(
                `"${exePath}"`,
                { timeout: EXECUTION_TIMEOUT_MS },
                (runErr, stdout, stderr) => {
                    if (runErr) {
                        if (runErr.killed || runErr.signal === 'SIGTERM') {
                            return resolve({
                                success: false,
                                output: 'Execution timed out (possible infinite loop).'
                            });
                        }

                        return resolve({
                            success: false,
                            output: stderr || runErr.message || 'Runtime error occurred.'
                        });
                    }

                    resolve({
                        success: true,
                        output: stdout || ''
                    });
                }
            );

            runProcess.stdin.write(`${input || ''}\n`);
            runProcess.stdin.end();
        });
    } catch (err) {
        return {
            success: false,
            output: err.stderr || err.message || 'Compilation failed.'
        };
    } finally {
        scheduleCleanup(filePath, exePath);
    }
}

app.post('/api/run', async (req, res) => {
    const { code, input } = req.body;
    const executionMode = process.env.NODE_ENV === 'production' ? 'Judge0' : 'local g++';

    if (shouldLogRunBurst(code, executionMode)) {
        console.log(`[RUN] Incoming /api/run request. NODE_ENV=${process.env.NODE_ENV || 'undefined'} -> ${executionMode}`);
    }

    if (!code) {
        return res.status(400).json({
            success: false,
            output: 'No code provided.'
        });
    }

    try {
        const result =
            process.env.NODE_ENV === 'production'
                ? await runWithJudge0(code, input)
                : await runLocally(code, input);

        return res.json(result);
    } catch (err) {
        console.error('Run route error:', err);

        return res.status(500).json({
            success: false,
            output: 'Server failed to execute the code.'
        });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
