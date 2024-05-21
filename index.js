// const fs = require('fs').promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const express = require("express");
const fs = require("fs");
const util = require("util");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/drive.metadata.readonly"];
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
  const content = await fs.promises.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.promises.writeFile(TOKEN_PATH, payload);
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
    fields: "nextPageToken, files(id, name)",
    q: `'${FOLDER_ID}' in parents`, // Add this line
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  console.log("Files:");
  files.map((file) => {
    // downloadFile(authClient, file.id, file.name);
    console.log(`${file.name} (${file.id})`);
  });
  console.log('---------------------------------');
  return files;
}



async function getFolderId(authClient, folderName) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: "nextPageToken, files(id, name)",
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log("No folders found.");
    return;
  }

  console.log("Folders:");
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
  });

  // Return the ID of the first folder found
  return files[0].id;
}
// console.log(authClient);
// authorize().then(listFiles).catch(console.error);
// authorize().then(authClient => getFolderId(authClient, 'internet pictures')).catch(console.error);

authorize()
  .then((authClient) => {
    listFiles(authClient);
  })
  .catch(console.error);

// Create a new express application
const app = express();
const port = 3000;

app.get('/', async (req, res) => {
  const files = await authorize().then(listFiles).catch(console.error);
  res.send(files.map(file => `${file.name} (${file.id})`).join('<br>'));
});

// const pipeline = util.promisify(require("stream").pipeline);
// async function downloadFile(authClient, fileId, destination) {
//   console.log(`Downloading file ${fileId} to`, destination);
//   const drive = google.drive({ version: "v3", auth: authClient });
//   const res = await drive.files.get(
//     {
//       fileId: fileId,
//       alt: "media",
//     },
//     { responseType: "stream" }
//   );

//   await pipeline(res.data, fs.createWriteStream(destination));
// }

// app.get("/", async (req, res) => {
//   let authClient;
//   // const files = await authorize().then(listFiles).catch(console.error);
//   const files = await authorize().then(listFiles).catch(console.error);
//   // const files = await authorize()
//   //   .then((ac) => {
//   //     console.log(ac);
//   //     authClient = ac;
//   //     listFiles(ac);
//   //   })
//   //   .catch(console.error);
//   // const files =
//   let html = "";
//   // for (let file of files) {
//   // console.log(files);
//   const file = files[0];
//   const content = await downloadFile(authClient, file.id, "/tmp/" + file.name);
//   html += `<h2>${file.name} (${file.id})</h2><pre>${content}</pre>`;
//   // }
//   res.send(html);
// });

// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}/`);
// });
