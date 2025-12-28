// index.js - Express backend for Render
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const btc = require('bitcoinjs-lib');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const NET = (net) => net === 'testnet' ? btc.networks.testnet : btc.networks.bitcoin;
const MEMPOOL = (net) => net === 'testnet' ? 'https://mempool.space/testnet/api' : 'https://mempool.space/api';

// Generate key pair
app.get('/api/generate-key', (req, res) => {
  const net = req.query.net || 'main';
  const keyPair = btc.ECPair.makeRandom({ network: NET(net) });
  const { address } = btc.payments.p2wpkh({ pubkey: keyPair.publicKey, network: NET(net) });
  res.json({ wif: keyPair.toWIF(), address, network: net });
});

// Fetch UTXOs
app.get('/api/utxos', async (req, res) => {
  const { address, net = 'main' } = req.query;
  try {
    const { data } = await axios.get(`${MEMPOOL(net)}/address/${address}/utxo`);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: 'Failed to fetch UTXOs' });
  }
});

// Broadcast TX
app.post('/api/broadcast', async (req, res) => {
  const { hex, net = 'main' } = req.body;
  try {
    const { data } = await axios.post(`${MEMPOOL(net)}/tx`, hex, {
      headers: { 'Content-Type': 'text/plain' }
    });
    res.json({ txid: data });
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// Double-spend crafting
app.post('/api/double-spend', (req, res) => {
  const { wif, utxo, outputAddress1, outputAddress2, feeRate, net = 'main', enableRBF = false } = req.body;

  try {
    const network = NET(net);
    const keyPair = btc.ECPair.fromWIF(wif, network);

    const txb1 = new btc.TransactionBuilder(network);
    const txb2 = new btc.TransactionBuilder(network);

    txb1.addInput(utxo.txid, utxo.vout);
    txb2.addInput(utxo.txid, utxo.vout);

    if (enableRBF) {
      txb1.enableRBF();
      txb2.enableRBF();
    }

    const fee = Math.ceil(feeRate * 150);
    const sendAmount1 = utxo.value - fee;
    const sendAmount2 = utxo.value - fee - 1000;

    txb1.addOutput(outputAddress1, sendAmount1);
    txb2.addOutput(outputAddress2, sendAmount2);

    txb1.sign(0, keyPair);
    txb2.sign(0, keyPair);

    const tx1 = txb1.build().toHex();
    const tx2 = txb2.build().toHex();

    res.json({
      tx1: { hex: tx1, txid: btc.Transaction.fromHex(tx1).getId() },
      tx2: { hex: tx2, txid: btc.Transaction.fromHex(tx2).getId() }
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Health check
app.get('/ping', (req, res) => res.send('pong'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`DoubleSpend API running on port ${PORT}`));
