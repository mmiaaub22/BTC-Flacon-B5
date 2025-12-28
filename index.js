// index.js - BTC Flacon API (Render backend)

const express = require("express");
const axios = require("axios");
const bitcoin = require("bitcoinjs-lib");

// ECPair now lives in a separate package
const ecc = require("tiny-secp256k1");
const { ECPairFactory } = require("ecpair");
const ECPair = ECPairFactory(ecc);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// -------- Helpers --------
const NET = (net) => {
  if (net === "main" || net === "mainnet") {
    return bitcoin.networks.bitcoin;
  }
  return bitcoin.networks.testnet; // default to testnet
};

const MEMPOOL = (net) => {
  if (net === "main" || net === "mainnet") {
    return "https://mempool.space/api";
  }
  return "https://mempool.space/testnet/api";
};

// -------- Routes --------

// Root status
app.get("/", (req, res) => {
  res.send("✅ BTC Flacon API is running!");
});

// Generate new keypair (WIF + address)
app.get("/api/generate-key", (req, res) => {
  try {
    const net = req.query.net || "testnet";
    const network = NET(net);

    const keyPair = ECPair.makeRandom({ network });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network,
    });

    res.json({
      wif: keyPair.toWIF(),
      address,
      network: net,
    });
  } catch (e) {
    res
      .status(500)
      .json({ error: "Failed to generate key", details: e.message });
  }
});

// Get UTXOs for an address
app.get("/api/utxos", async (req, res) => {
  const { address, net = "testnet" } = req.query;
  if (!address) {
    return res.status(400).json({ error: "Missing address param" });
  }

  try {
    const url = `${MEMPOOL(net)}/address/${address}/utxo`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res
      .status(500)
      .json({ error: "UTXO fetch failed", details: e.message });
  }
});

// Fee estimate
app.get("/api/fee", async (req, res) => {
  const net = req.query.net || "testnet";
  try {
    const { data } = await axios.get(
      `${MEMPOOL(net)}/v1/fees/recommended`
    );
    res.json({
      minimumFee: data.minimumFee,
      fastestFee: data.fastestFee,
      halfHourFee: data.halfHourFee,
      hourFee: data.hourFee,
      economyFee: data.economyFee,
    });
  } catch (e) {
    res.status(500).json({
      error: "Fee lookup failed",
      details: e.message,
    });
  }
});

// Broadcast a single transaction
app.post("/api/broadcast", async (req, res) => {
  const { hex, net = "testnet" } = req.body;
  if (!hex) {
    return res.status(400).json({ error: "Missing hex" });
  }

  try {
    const url = `${MEMPOOL(net)}/tx`;
    const { data } = await axios.post(url, hex, {
      headers: { "Content-Type": "text/plain" },
    });
    res.json({ txid: data });
  } catch (e) {
    res.status(500).json({
      error: "Broadcast failed",
      details: e.response?.data || e.message,
    });
  }
});

// Optional: broadcast multiple txs (lab use, e.g. conflicting testnet txs)
app.post("/api/broadcast-batch", async (req, res) => {
  const { hexes, net = "testnet" } = req.body;
  if (!Array.isArray(hexes) || hexes.length === 0) {
    return res
      .status(400)
      .json({ error: "Provide hexes as a non-empty array" });
  }

  try {
    const url = `${MEMPOOL(net)}/tx`;
    const results = [];
    for (const hex of hexes) {
      const { data } = await axios.post(url, hex, {
        headers: { "Content-Type": "text/plain" },
      });
      results.push({ txid: data });
    }
    res.json({ results });
  } catch (e) {
    res.status(500).json({
      error: "Batch broadcast failed",
      details: e.response?.data || e.message,
    });
  }
});

// Health check
app.get("/ping", (req, res) => res.send("pong"));

app.listen(PORT, () => {
  console.log(`🚀 BTC Flacon API running on port ${PORT}`);
});
