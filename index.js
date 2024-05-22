import { authenticate } from "@google-cloud/local-auth";
import express from "express";
import fs from "fs/promises";
import { google } from "googleapis";
import path from "path";
import process from "process";

// If modifying these scopes, delete token.json.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];
const FOLDER_ID = "12eMATT8B2JEUpVnaPZDNzxNnhfY3471F";
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

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
    pageSize: 1000,
    fields: "nextPageToken, files(id, name, mimeType, webContentLink, size)",
    q: `'${FOLDER_ID}' in parents`, // Add this line
});
  const files = res.data.files;

  return files
    .filter(
      (file) =>
        file.mimeType.startsWith("video") || file.mimeType.startsWith("image")
    )
    .map((file) => ({
      id: file.id,
      mimeType: file.mimeType,
      link: file.webContentLink?.replace("&export=download", ""),
      size: +file.size,
    }));
}

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const MB = 1024 * 1024;
const CHUNK_SIZE = MB * 1;
let files = {};
async function main() {
  const auth = await authorize();
  const filesArray = await listFiles(auth);

  for (const f of filesArray) {
    files[f.id] = f;
  }

  const app = express();

  app.get("/", async (req, res) => {
    const keys = Object.keys(files);
    const randomKey = keys[randomIntFromInterval(0, keys.length - 1)];
    const randomFile = files[randomKey];
    console.log(randomFile);
    res.setHeader("Content-Type", "text/html");
    const isVideo = randomFile.mimeType.startsWith("video");
    const tag = isVideo
      ? `<video controls playsinlne autoplay src="/resource/${randomFile.id}"></video>`
      : `<img src="/resource/${randomFile.id}"/>`;
    return res.status(200).send(`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Document</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              display: flex;
              height: 100vh;
              justify-content: space-between;
              align-items: center;
              flex-direction: column;
              padding: 1rem;
            }
            img {
              height: 100%;
              width: 100%;
              margin-bottom: 2rem;
              object-fit: contain;
            }
            video {
                max-height: 90vh;
            }
          </style>
        </head>
        <body>
            \n
          ${tag}
          \n
          <form action="/">
            <button type="submit">Next</button>
          </form>
        </body>
      </html>`);
  });
  app.get("/resource/:id", async (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(404).end();
    const fileData = files[id];
    if (!fileData) return res.status(404).end();
    if (fileData.mimeType.startsWith("image")) {
      return getImage(auth, fileData, res);
    } else {
      return getVideo(auth, fileData, res, req.headers.range);
    }
  });
  app.listen(3000, () => {
    console.log("READY http://localhost:3000");
  });
}
main();
async function getImage(auth, file, res) {
  google.drive({ version: "v3", auth }).files.get(
    {
      fileId: file.id,
      alt: "media",
    },
    {
      responseType: "stream",
    },
    (err, response) => {
      if (err) throw err;
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Length", file.size);
      response.data
        .on("end", () => {
          res.end();
        })
        .pipe(res);
    }
  );
}
async function getVideo(auth, file, res, range) {
  const start = Number(range.replace(/\D/g, ""));
  const end = Math.min(start + CHUNK_SIZE, file.size - 1);
  google.drive({ version: "v3", auth }).files.get(
    {
      fileId: file.id,
      alt: "media",
    },
    {
      responseType: "stream",
      headers: { Range: `bytes=${start}-${end}` },
    },
    (err, response) => {
      if (err) throw err;
      const headers = {
        "Content-Range": response.headers["content-range"],
        "Content-Length": response.headers["content-length"],
        "Content-Type": response.headers["content-type"],
      };
      res.writeHead(response.status, headers);
      response.data
        .on("end", () => {
          console.log("downloaded data", response.headers["content-length"]);
          res.end();
        })
        .pipe(res);
    }
  );
}