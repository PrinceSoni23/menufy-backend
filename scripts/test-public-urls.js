#!/usr/bin/env node
/**
 * Public URL Test & Verification Script
 * Verifies that uploads are accessible from any device/browser/location
 *
 * Usage:
 *   node scripts/test-public-urls.js
 *   node scripts/test-public-urls.js --upload <filename>
 *   node scripts/test-public-urls.js --check http://localhost:5000/uploads/images/test.jpg
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

async function fetchUrl(url, method = "HEAD") {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const options = {
      method,
      timeout: 5000,
    };

    const req = client.request(url, options, res => {
      resolve({
        status: res.statusCode,
        headers: res.headers,
      });
    });

    req.on("error", err => {
      reject(err);
    });

    req.end();
  });
}

async function testPublicUrl(baseUrl) {
  console.log("\n🔍 Testing Public URL Accessibility");
  console.log("===================================\n");

  const testPaths = ["/uploads/images", "/uploads/3d-models"];

  for (const testPath of testPaths) {
    const url = `${baseUrl}${testPath}`;
    console.log(`Testing: ${url}`);

    try {
      const result = await fetchUrl(url, "HEAD");
      if (result.status === 200 || result.status === 403) {
        console.log(`  ✅ Accessible (${result.status})`);
      } else if (result.status === 404) {
        console.log(`  ⚠️  Path not found (404)`);
      } else {
        console.log(`  ❌ Error (${result.status})`);
      }
    } catch (error) {
      console.log(`  ❌ Not reachable: ${error.message}`);
    }
  }
}

async function testApiEndpoint(baseUrl) {
  console.log("\n📋 Checking API Configuration");
  console.log("=============================\n");

  const verifyUrl = `${baseUrl}/api/upload/verify`;
  console.log(`Calling: ${verifyUrl}\n`);

  try {
    const result = await fetchUrl(verifyUrl, "GET");
    console.log(`Status: ${result.status}`);

    if (result.status === 200) {
      console.log(
        "✅ API endpoint is working - full configuration is in response",
      );
      console.log("\nOpen this URL in your browser to see full details:");
      console.log(`  ${verifyUrl}\n`);
    } else {
      console.log(`❌ API returned: ${result.status}`);
    }
  } catch (error) {
    console.log(`❌ Could not reach API: ${error.message}`);
    console.log(`\nMake sure the backend is running at: ${baseUrl}\n`);
  }
}

async function main() {
  const baseUrl = process.env.API_URL || "http://localhost:5000";

  console.log(`\n🚀 Public URL Accessibility Test`);
  console.log(`================================`);
  console.log(`\nTesting with base URL: ${baseUrl}`);

  if (args.includes("--help")) {
    console.log(`\nUsage:`);
    console.log(`  node scripts/test-public-urls.js`);
    console.log(
      `  node scripts/test-public-urls.js --url http://192.168.1.100:5000`,
    );
    console.log(`  node scripts/test-public-urls.js --check <full-url>`);
    return;
  }

  if (args.includes("--url")) {
    const urlIdx = args.indexOf("--url");
    if (urlIdx + 1 < args.length) {
      await testPublicUrl(args[urlIdx + 1]);
    }
  } else if (args.includes("--check")) {
    const checkIdx = args.indexOf("--check");
    if (checkIdx + 1 < args.length) {
      const url = args[checkIdx + 1];
      console.log(`\nChecking: ${url}`);
      try {
        const result = await fetchUrl(url);
        console.log(`Status: ${result.status}`);
        console.log(
          `✅ File is ${result.status === 200 ? "accessible" : "not accessible"}`,
        );
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }
  } else {
    await testApiEndpoint(baseUrl);
    await testPublicUrl(baseUrl);

    console.log("\n📝 Instructions");
    console.log(`================`);
    console.log(`\n1. If testing from different device (not localhost):`);
    console.log(`   Set in .env: PUBLIC_API_URL=http://<your-machine-ip>:5000`);
    console.log(`   Example: PUBLIC_API_URL=http://192.168.1.100:5000\n`);

    console.log(`2. For production:`);
    console.log(`   Set in .env: PUBLIC_API_URL=https://yourdomain.com\n`);

    console.log(`3. Test a specific URL:`);
    console.log(
      `   node scripts/test-public-urls.js --check <full-url-to-file>\n`,
    );

    console.log(`4. View full configuration:`);
    console.log(`   Open in browser: ${baseUrl}/api/upload/verify\n`);
  }
}

main().catch(console.error);
