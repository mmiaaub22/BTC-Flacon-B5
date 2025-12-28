const express = require("express");
const axios = require("axios");
const btc = require("bitcoinjs-lib");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const NET = (net) => net === 'testnet' ? btc.networks.testnet : btc.networks.bitcoin;
const MEMPOOL = (net) => net === 'testnet' ? 'https://mempool.space/testnet/api' : 'https://mempool.space/api';

// Root: basic status check
app.get("/", (req, res) => {
  res.send("✅ BTC Flacon API is running!");
});

// Generate new BTC key (WIF + Address)
app.get("/api/generate-key", (req, res) => {
  try {
    const net = req.query.net || 'testnet';
    const network = NET(net);

    const keyPair = btc.ECPair.makeRandom({ network });
    const { address } = btc.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network,
    });

    res.json({
      wif: keyPair.toWIF(),
      address,
      network: net,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to generate key", details: e.message });
  }
});

// Get UTXOs for an address
app.get("/api/utxos", async (req, res) => {
  const { address, net = "testnet" } = req.query;
  if (!address) return res.status(400).json({ error: "Missing address param" });

  try {
    const url = `${MEMPOOL(net)}/address/${address}/utxo`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "UTXO fetch failed", details: e.message });
  }
});

// Broadcast TX
app.post("/api/broadcast", async (req, res) => {
  const { hex, net = "testnet" } = req.body;
  if (!hex) return res.status(400).json({ error: "Missing hex" });

  try {
    const url = `${MEMPOOL(net)}/tx`;
    const { data } = await axios.post(url, hex, {
      headers: { "Content-Type": "text/plain" },
    });
    res.json({ txid: data });
  } catch (e) {
    res.status(500).json({ error: "Broadcast failed", details: e.message });
  }
});

// Double-spend broadcast logic (TX-B override)
app.post("/api/double-spend", async (req, res) => {
  const { hexA, hexB, net = "testnet" } = req.body;
  if (!hexA || !hexB) return res.status(400).json({ error: "Missing hexA or hexB" });

  try {
    const url = `${MEMPOOL(net)}/tx`;

    // Broadcast TX-A (low fee)
    await axios.post(url, hexA, {
      headers: { "Content-Type": "text/plain" },
    });

    // Delay (optional): could add setTimeout here if needed

    // Broadcast TX-B (high fee double-spend)
    await axios.post(url, hexB, {
      headers: { "Content-Type": "text/plain" },
    });

    res.json({ status: "Double-spend attempt broadcasted" });
  } catch (e) {
    res.status(500).json({ error: "Double-spend failed", details: e.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 BTC Flacon API running on port ${PORT}`);
});
