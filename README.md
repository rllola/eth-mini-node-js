# Ethereum custom node

This project looks into how to create a minimalist node that retrieve the blocks and transactions from Ethereum directly from peers. The purpose of it is too quickly export data that could be used for research without running a full node and also to understand Ethereum P2P protocol.

## Start

```
$ npm install
$ node index.js
```

## Notes

Currently `@ethereumjs/devp2p` is broken and will disconnect every 5 seconds because of a badly place `setTimeout` call. Trying to fix it in https://github.com/rllola/ethereumjs-monorepo

