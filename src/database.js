import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Initialize Database
let db;

export function initDatabase(dbPath) {
    // Ensure the directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL'); // Better concurrency

    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS attractions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            park_id TEXT NOT NULL,
            status TEXT NOT NULL,
            wait_time INTEGER,
            last_updated DATETIME NOT NULL,
            last_status_change DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attraction_id TEXT NOT NULL,
            status TEXT NOT NULL,
            wait_time INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(attraction_id) REFERENCES attractions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_history_timestamp ON status_history(timestamp);
    `);

    console.log('Database initialized successfully.');
}

/**
 * Clean up history older than X days
 */
export function cleanupHistory(daysToKeep) {
    const stmt = db.prepare(`
        DELETE FROM status_history 
        WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
    const info = stmt.run(daysToKeep);
    console.log(`Cleaned up ${info.changes} old history records.`);
}

/**
 * Update an attraction's status and track history if changed
 */
export function updateAttractionStatus(attraction) {
    // Fetch current state
    const currentStmt = db.prepare('SELECT status, wait_time, last_status_change FROM attractions WHERE id = ?');
    const currentState = currentStmt.get(attraction.id);

    const now = new Date().toISOString();
    let lastStatusChange = now;

    let hasStatusChanged = false;
    let hasWaitTimeChanged = false;

    if (currentState) {
        if (currentState.status !== attraction.status) {
            hasStatusChanged = true;
            // Status changed, update last_status_change
            lastStatusChange = now;
        } else {
            // Keep the old last_status_change
            lastStatusChange = currentState.last_status_change;
        }

        if (currentState.wait_time !== attraction.wait_time) {
            hasWaitTimeChanged = true;
        }
    } else {
        // New attraction
        hasStatusChanged = true;
    }

    // Insert or Replace into attractions
    const upsertStmt = db.prepare(`
        INSERT INTO attractions (id, name, park_id, status, wait_time, last_updated, last_status_change)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            park_id = excluded.park_id,
            status = excluded.status,
            wait_time = excluded.wait_time,
            last_updated = excluded.last_updated,
            last_status_change = excluded.last_status_change
    `);

    upsertStmt.run(
        attraction.id,
        attraction.name,
        attraction.parkId,
        attraction.status,
        attraction.wait_time,
        now,
        lastStatusChange
    );

    // If status or wait time changed, log to history
    if (hasStatusChanged || hasWaitTimeChanged) {
        const historyStmt = db.prepare(`
            INSERT INTO status_history (attraction_id, status, wait_time, timestamp)
            VALUES (?, ?, ?, ?)
        `);
        historyStmt.run(attraction.id, attraction.status, attraction.wait_time, now);
    }

    return { hasStatusChanged, hasWaitTimeChanged, previousState: currentState };
}

export function getAllAttractions() {
    return db.prepare('SELECT * FROM attractions ORDER BY name ASC').all();
}
