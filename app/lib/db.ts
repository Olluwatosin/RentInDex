import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "waitlist.json");

interface WaitlistEntry {
  email: string;
  joinedAt: string;
}

function ensureDbExists() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ emails: [] }, null, 2));
  }
}

export function getAllEmails(): WaitlistEntry[] {
  ensureDbExists();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const db = JSON.parse(raw);
  return db.emails as WaitlistEntry[];
}

export function addEmail(email: string): { success: boolean; alreadyExists: boolean } {
  ensureDbExists();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const db = JSON.parse(raw);
  const emails: WaitlistEntry[] = db.emails;

  const exists = emails.some((e) => e.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return { success: false, alreadyExists: true };
  }

  emails.push({ email: email.toLowerCase(), joinedAt: new Date().toISOString() });
  fs.writeFileSync(DB_PATH, JSON.stringify({ emails }, null, 2));
  return { success: true, alreadyExists: false };
}

export function getCount(): number {
  ensureDbExists();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const db = JSON.parse(raw);
  return (db.emails as WaitlistEntry[]).length;
}
