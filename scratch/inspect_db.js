import sqlite3 from 'sqlite3';

const dbPath = 'C:\\Users\\Bilal\\AppData\\Roaming\\zimozo-windows-app\\zimozo_offline.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  }
});

db.serialize(() => {
  console.log('Resetting and repairing sale 9...');

  // Reset sales table sync_status to pending
  db.run("UPDATE sales SET sync_status = 'pending' WHERE id = 9", [], (err) => {
    if (err) console.error(err);
    else console.log('Updated sales table.');
  });

  // Query the sync_queue item 9 payload
  db.get("SELECT payload FROM sync_queue WHERE id = 9", [], (err, row) => {
    if (err) {
      console.error(err);
      db.close();
      return;
    }

    if (row && row.payload) {
      try {
        const payloadObj = JSON.parse(row.payload);
        // Correct the contact_id to 749
        payloadObj.contact_id = 749;
        const newPayload = JSON.stringify(payloadObj);

        // Update sync_queue status to pending, retry_count to 0, payload to newPayload, error_log to NULL
        db.run(
          "UPDATE sync_queue SET status = 'pending', retry_count = 0, payload = ?, error_log = NULL, synced_at = NULL WHERE id = 9",
          [newPayload],
          function(err2) {
            if (err2) console.error(err2);
            else console.log(`Repaired and reset sync_queue item 9!`);
            db.close();
          }
        );
      } catch (e) {
        console.error('JSON Parse error:', e);
        db.close();
      }
    } else {
      console.log('Sync queue item 9 not found.');
      db.close();
    }
  });
});
