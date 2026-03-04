import dotenv from 'dotenv';
import express from 'express';
import { initDatabase, updateAttractionStatus, cleanupHistory, getAllAttractions } from './database.js';
import { fetchDisneylandParisData } from './fetcher.js';

dotenv.config();

const port = process.env.PORT || 3000;
const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS) || 30000;
const dbRetentionDays = parseInt(process.env.DB_RETENTION_DAYS) || 7;
const dbPath = process.env.DB_PATH || './data/castpulse.db';
const apiUrl = process.env.THEMEPARKS_API_URL || 'https://api.themeparks.wiki/v1/entity';

const app = express();

// Initialize the Database
initDatabase(dbPath);

app.get('/api/attractions', (req, res) => {
    try {
        const attractions = getAllAttractions();
        res.json(attractions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`CastPulse Backend listening on port ${port}`);
    startPolling();
});

function calculateStatusDurationMinutes(lastStatusChange) {
    const diffMs = new Date() - new Date(lastStatusChange);
    return Math.floor(diffMs / 60000); // in minutes
}

async function runPoll() {
    console.log(`[${new Date().toISOString()}] Fetching live data...`);
    const attractions = await fetchDisneylandParisData(apiUrl);

    if (attractions.length === 0) {
        console.log('No attractions data fetched. Skipping DB update.');
        return;
    }

    let downCount = 0;
    for (const attraction of attractions) {
        const result = updateAttractionStatus(attraction);
        if (attraction.status === 'DOWN') {
            downCount++;
        }

        // Example logging for "101" / "102" changes
        if (result.hasStatusChanged) {
            const oldStatus = result.previousState ? result.previousState.status : 'UNKNOWN';
            if (attraction.status === 'DOWN') {
                console.log(`🚨 101 DETECTED: ${attraction.name} went DOWN!`);
            } else if (oldStatus === 'DOWN' && attraction.status === 'OPERATING') {
                console.log(`✅ 102 DETECTED: ${attraction.name} is back OPERATING!`);
            }
        }
    }

    console.log(`Polled ${attractions.length} attractions. ${downCount} rides are 101/DOWN.`);

    // Run cleanup for old data
    cleanupHistory(dbRetentionDays);
}

function startPolling() {
    // Run immediately first time
    runPoll();

    // Then set interval
    setInterval(runPoll, pollIntervalMs);
}
