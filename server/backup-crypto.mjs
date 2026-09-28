import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";

const header = Buffer.from("FMBK0001");
const ivLength = 12;
const tagLength = 16;

function backupKey() {
  const value = process.env.BACKUP_ENCRYPTION_KEY;
  if (!value) throw new Error("BACKUP_ENCRYPTION_KEY must be set");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

async function write(chunk) {
  if (process.stdout.write(chunk)) return;
  await new Promise((resolve) => process.stdout.once("drain", resolve));
}

async function encrypt() {
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv("aes-256-gcm", backupKey(), iv);
  await write(header);
  await write(iv);
  for await (const chunk of process.stdin) await write(cipher.update(chunk));
  await write(cipher.final());
  await write(cipher.getAuthTag());
}

async function decrypt(file) {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    if (size < header.length + ivLength + tagLength) {
      throw new Error("Backup file is too short");
    }
    const prefix = Buffer.alloc(header.length + ivLength);
    const tag = Buffer.alloc(tagLength);
    await handle.read(prefix, 0, prefix.length, 0);
    await handle.read(tag, 0, tag.length, size - tagLength);
    if (!prefix.subarray(0, header.length).equals(header)) {
      throw new Error("Backup file is not a Feedme encrypted backup");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      backupKey(),
      prefix.subarray(header.length),
    );
    decipher.setAuthTag(tag);
    const ciphertext = createReadStream(file, {
      start: header.length + ivLength,
      end: size - tagLength - 1,
    });
    for await (const chunk of ciphertext) await write(decipher.update(chunk));
    await write(decipher.final());
  } finally {
    await handle.close();
  }
}

const [operation, file] = process.argv.slice(2);
if (operation === "encrypt") await encrypt();
else if (operation === "decrypt" && file) await decrypt(file);
else throw new Error("Usage: backup-crypto.mjs encrypt | decrypt BACKUP_FILE");
