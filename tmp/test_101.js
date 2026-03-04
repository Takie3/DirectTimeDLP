import { initDatabase, updateAttractionStatus, cleanupHistory } from '../src/database.js';
import dotenv from 'dotenv';
dotenv.config();

const dbPath = process.env.DB_PATH || './data/castpulse.db';
initDatabase(dbPath);

console.log('--- Initial State ---');
const btnMtn = {
    id: 'BTM-123',
    name: 'Big Thunder Mountain',
    parkId: 'DLP-1',
    status: 'OPERATING',
    wait_time: 45
};

let res1 = updateAttractionStatus(btnMtn);
console.log('First pass:', res1);

console.log('--- 101 Detected ---');
btnMtn.status = 'DOWN';
btnMtn.wait_time = null;

setTimeout(() => {
    let res2 = updateAttractionStatus(btnMtn);
    console.log('Second pass (DOWN):', res2);

    console.log('--- Still 101 After some time (Status should not change) ---');
    setTimeout(() => {
        let res3 = updateAttractionStatus(btnMtn);
        console.log('Third pass (still DOWN):', res3);
        console.log('Note the last_status_change should be from pass 2!');

        console.log('--- 102 Detected ---');
        btnMtn.status = 'OPERATING';
        btnMtn.wait_time = 15;
        setTimeout(() => {
            let res4 = updateAttractionStatus(btnMtn);
            console.log('Fourth pass (OPERATING):', res4);
            process.exit(0);
        }, 1000);
    }, 1000);
}, 1000);
