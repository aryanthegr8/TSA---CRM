import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const required = ["DB_HOST", "DB_USER", "DB_NAME"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required in .env.local`);
}

async function readHidden(prompt) {
  if (!stdin.isTTY) throw new Error("Run this command in an interactive terminal.");
  stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (buffer) => {
      for (const char of buffer.toString()) {
        if (char === "\r" || char === "\n") {
          stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); stdout.write("\n"); resolve(value); return;
        }
        if (char === "\u0003") {
          stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); reject(new Error("Cancelled")); return;
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}
const rl = createInterface({ input: stdin, output: stdout });
let db;
try {
  const name = (await rl.question("Admin name: ")).trim();
  const email = (await rl.question("Admin email: ")).trim().toLowerCase();
  rl.close();
  const password = await readHidden("Admin password (hidden): ");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
    throw new Error("Provide a name, valid email and a password of at least 12 characters.");
  }
  db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [existing] = await db.execute("SELECT id FROM crm_users WHERE email = ?", [email]);
  if (existing.length) throw new Error("An account with this email already exists.");
  const hash = await bcrypt.hash(password, 12);
  await db.execute(
    "INSERT INTO crm_users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, 'admin', 1)",
    [name, email, hash]
  );
  console.log("Admin account created.");
} finally {
  await db?.end();
  rl.close();
}
