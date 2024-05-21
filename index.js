// const fs = require("fs").promises;
import fs from "fs/promises";
// const path = require("path");
import path from "path";
// const process = require("process");
import process from "process";
// const { authenticate } = require("@google-cloud/local-auth");
import { authenticate } from "@google-cloud/local-auth";
// const { google } = require("googleapis");
// const express = require("express");
import express from "express";
import { google } from "googleapis";
// const chalk = require("chalk");
import chalk from "chalk";
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
    // console.log(client);
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
    fields: "nextPageToken, files(id, name, mimeType)",
    q: `'${FOLDER_ID}' in parents`, // Add this line
  });

  const files = res.data.files;
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  //   console.log("Files:");
  return files.map((file) => ({ id: file.id, mimeType: file.mimeType }));
}
// async function listFiles(authClient, folderId = FOLDER_ID) {
//   const drive = google.drive({ version: "v3", auth: authClient });
//   const res = await drive.files.list({
//     pageSize: 1000,
//     fields: "nextPageToken, files(id, name, mimeType)",
//     q: `'${folderId}' in parents`,
//   });
//   const files = res.data.files;
//   if (files.length === 0) {
//     console.log("No files found.");
//     return [];
//   }

//   let allFiles = [];
//   for (const file of files) {
//     allFiles.push(file);
//     if (file.mimeType === "application/vnd.google-apps.folder") {
//       const subFiles = await listFiles(authClient, file.id);
//       allFiles = allFiles.concat(subFiles);
//     }
//   }
//   return allFiles;
// }

const displayFile = async (authClient, fileId) => {
  const drive = google.drive({ version: "v3", auth: authClient });

  const driveResponse = await drive.files.get(
    {
      fileId: fileId,
      alt: "media",
    },
    { responseType: "stream" }
  );

  // const metadata = driveResponse.data;
  // res.set({
  //     "Content-Type": metadata.mimeType,
  //     "Content-Length": metadata.size,
  //     "Content-Disposition": `attachment; filename="${metadata.name}"`,
  // });
  // return driveResponse;

  //   driveResponse.data
  //     .on("error", (err) => {
  //       console.error("Error downloading file.");
  //       res.status(500).send(err.toString());
  //     })
  //     .pipe(res);
  return driveResponse;
};

async function main() {
  const client = await authorize();
  const app = express();
  app.get("/", async (req, res, next) => {
    const files = await listFiles(client);
    console.log(files);
    const randomIndex = Math.floor(Math.random() * files.length);
    // console.log(halk.(randomIndex));
    console.log(chalk.bgGreenBright("Random index: ", randomIndex));

    const { id, mimeType } = files[randomIndex];
    console.log(chalk.bgGreenBright("mimeType : ", mimeType));

    const response = await displayFile(client, id);
    res.setHeader("Content-Type", mimeType);
    
    
    response.data.pipe(res);
    
    // return res.status(200).send(response);
  });

  app.listen(3000);
}

main();
