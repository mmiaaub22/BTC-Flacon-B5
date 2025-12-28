// index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const btc = require('bitcoinjs-lib');

const app = express();
app.use(cors());
app.use(express.json());

const NET = (net) => net === 'testnet' ? btc.networks.testnet : btc.networks.bitcoin;
const MEMPOOL = (net) => net === 'testnet' ? 'https://mempool.space/testnet/api' : 'https://mempool.space/api';

app.get('/api/generate-key', (req, res) => {
  const net = req.query.net || 'main';
  const network = NET(net);
  const keyPair = btc.ECPair.makeRandom({ network });
  const { address } = btc.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
  res.json({ wif: keyPair.toWIF(), address });
});

app.get('/api/utxos', async (req, res) => {
  const { address, net = 'main' } = req.query;
  try {
    const { data } = await axios.get(`${MEMPOOL(net)}/address/${address}/utxo`);
    res.json(data);
  } catch {
    res.status(400).json({ error: 'Failed to fetch UTXOs' });
  }
});

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
      txb1.setVersion(2);
      txb2.setVersion(2);
    }

    const sendAmount1 = utxo.value - Math.ceil(feeRate * 150);
    const sendAmount2 = utxo.value - Math.ceil(feeRate * 150) - 1000;

    txb1.addOutput(outputAddress1, sendAmount1);
    txb2.addOutput(outputAddress2, sendAmount2);

    txb1.sign(0, keyPair);
    txb2.sign(0, keyPair);

    const tx1 = txb1.build();
    const tx2 = txb2.build();

    res.json({
      tx1: { hex: tx1.toHex(), txid: tx1.getId() },
      tx2: { hex: tx2.toHex(), txid: tx2.getId() }
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

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

app.get('/ping', (_, res) => res.send('pong'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
