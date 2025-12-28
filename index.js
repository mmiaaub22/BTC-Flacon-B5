// index.js — Final Render-Compatible Version
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bodyParser = require("body-parser");
const bitcoin = require("bitcoinjs-lib");
const ecc = require("tiny-secp256k1");
const { ECPairFactory } = require("ecpair");

// Create ECPair instance
const ECPair = ECPairFactory(ecc);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Network helper
const NET = (n) => (n === "testnet" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin);
const MEMPOOL = (n) =>
  n === "testnet"
    ? "https://mempool.space/testnet/api"
    : "https://mempool.space/api";

// ----------------------------
// ROOT ENDPOINT (SHOW STATUS)
// ----------------------------
app.get("/", (req, res) => {
  res.send(`<h2>✅ BTC Flacon API is running!</h2>`);
});

// ----------------------------
// GENERATE KEYPAIR
// ----------------------------
app.get("/api/generate-key", (req, res) => {
  try {
    const net = req.query.net || "main";
    const network = NET(net);

    // WORKING makeRandom()
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
  } catch (err) {
    res.status(500).json({
      error: "Failed to generate key",
      details: err.message,
    });
  }
});

// ----------------------------
// GET UTXOs
// ----------------------------
app.get("/api/utxos", async (req, res) => {
  try {
    const { address, net = "main" } = req.query;
    const url = `${MEMPOOL(net)}/address/${address}/utxo`;
    const { data } = await axios.get(url);

    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: "UTXO fetch failed",
      details: err.message,
    });
  }
});

// ----------------------------
// BROADCAST RAW TX
// ----------------------------
app.post("/api/broadcast", async (req, res) => {
  try {
    const { hex, net = "main" } = req.body;

    const url = `${MEMPOOL(net)}/tx`;
    const { data } = await axios.post(url, hex, {
      headers: { "Content-Type": "text/plain" },
    });

    res.json({ txid: data });
  } catch (err) {
    res.status(500).json({
      error: "Broadcast failed",
      details: err.response?.data || err.message,
    });
  }
});

// ----------------------------
// DOUBLE SPEND BUILDER (PSBT)
// ----------------------------
app.post("/api/double-spend", async (req, res) => {
  try {
    const {
      wif,
      utxo,
      outputAddress1,
      outputAddress2,
      feeRate,
      net = "main",
      enableRBF = false,
    } = req.body;

    const network = NET(net);
    const keyPair = ECPair.fromWIF(wif, network);

    const psbt1 = new bitcoin.Psbt({ network });
    const psbt2 = new bitcoin.Psbt({ network });

    const rbfFlag = enableRBF ? 0xfffffffd : undefined;

    // INPUT
    const inputObj = {
      hash: utxo.txid,
      index: utxo.vout,
      sequence: rbfFlag,
      witnessUtxo: {
        script: bitcoin.payments.p2wpkh({
          pubkey: keyPair.publicKey,
          network,
        }).output,
        value: utxo.value,
      },
    };

    psbt1.addInput(inputObj);
    psbt2.addInput(inputObj);

    // Output amounts
    const fee = Math.ceil(feeRate * 140);
    const amount1 = utxo.value - fee;
    const amount2 = utxo.value - fee - 500;

    psbt1.addOutput({ address: outputAddress1, value: amount1 });
    psbt2.addOutput({ address: outputAddress2, value: amount2 });

    // Sign
    psbt1.signAllInputs(keyPair);
    psbt2.signAllInputs(keyPair);

    psbt1.finalizeAllInputs();
    psbt2.finalizeAllInputs();

    const tx1 = psbt1.extractTransaction();
    const tx2 = psbt2.extractTransaction();

    res.json({
      tx1: {
        hex: tx1.toHex(),
        txid: tx1.getId(),
      },
      tx2: {
        hex: tx2.toHex(),
        txid: tx2.getId(),
      },
    });
  } catch (err) {
    res.status(500).json({
      error: "Double-spend build failed",
      details: err.message,
    });
  }
});

// ----------------------------
// HEALTH CHECK
// ----------------------------
app.get("/ping", (req, res) => {
  res.send("pong");
});

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`BTC Flacon API running on port ${PORT}`));
