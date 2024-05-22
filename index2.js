import { authenticate } from "@google-cloud/local-auth";
import express from "express";
import fs from "fs/promises";
import { google } from "googleapis";
import path from "path";
import process from "process";

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/drive.metadata.readonly", "https://www.googleapis.com/auth/drive.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const FOLDER_ID = "12eMATT8B2JEUpVnaPZDNzxNnhfY3471F";

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: "nextPageToken, files(id, name, mimeType, webContentLink, size)",
    q: `'${FOLDER_ID}' in parents`, // Add this line
  });

  const files = res.data.files;

  return files
    .map((file) => ({
      id: file.id,
      mimeType: file.mimeType,
      link: file.webContentLink?.replace("&export=download", ""),
      size: +file.size,
    }))
    // .filter((file) => file.mimeType === "video/mp4");
}

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const MB = 1024 * 1024;
const CHUNK_SIZE = MB * 1;

async function main() {
  const client = await authorize();
  const app = express();

  withGoogleDrive(app, client);

  app.listen(3000);
}
main();

function withGoogleDrive(app, client) {
  let currentFile = undefined;
  app.get("/", async (req, res) => {
    let range = req.headers.range;
    if (range) {
      if (!currentFile) throw new Error("Recived range request but currentFile is empty.");
    } else {
      // we dont have range header in the request, pick a new file
      const files = await listFiles(client);
      currentFile = files[randomIntFromInterval(0, files.length - 1)];
      // currentFile = files[0];
    }
    google.drive({ version: "v3", auth: client }).files.get(
      {
        fileId: currentFile.id,
        alt: "media",
      },
      {
        responseType: "stream",
        headers: range ? { Range: range } : undefined,
      },
      (err, response) => {
        if (err) throw err;
        if (range) {
          const start = Number(range.replace(/\D/g, ""));
          const end = Math.min(start + CHUNK_SIZE, currentFile.size - 1);

          const contentLength = end - start + 1;
          const headers = {
            "Content-Range": `bytes ${start}-${end}/${currentFile.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength,
            "Content-Type": "video/mp4",
          };
          res.writeHead(response.status, headers);
        } else {
          const headers = {
            "Content-Length": currentFile.size,
            "Content-Type": currentFile.mimeType,
          };
          res.writeHead(200, headers);
        }

        response.data
          .on("end", () => {
            res.end();
          })
          .pipe(res);
      }
    );
  });
}
