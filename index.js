const { randomBytes } = require('crypto')
const { Block, BlockHeader } = require('@ethereumjs/block')
const { Chain, Common, Hardfork } = require('@ethereumjs/common')
const { DPT, RLPx, LES, int2buffer, buffer2int } = require('@ethereumjs/devp2p')
const ms = require('ms')

const PRIVATE_KEY = randomBytes(32)

const common = new Common({ chain: Chain.Rinkeby, hardfork: Hardfork.London })
const bootstrapNodes = common.bootstrapNodes()
const BOOTNODES = bootstrapNodes.map((node) => {
  return {
    address: node.ip,
    udpPort: node.port,
    tcpPort: node.port,
  }
})

const getPeerAddr = (peer) => `${peer._socket.remoteAddress}:${peer._socket.remotePort}`

function isValidTx(tx) {
  return tx.validate()
}

async function isValidBlock(block) {
  return (
    block.validateUnclesHash() &&
    block.transactions.every(isValidTx) &&
    block.validateTransactionsTrie()
  )
}

function onNewBlock(block, peer) {
  const blockHashHex = block.hash().toString('hex')
  const blockNumber = block.header.number

  console.log(`block ${blockNumber} received: ${blockHashHex} txs number : ${block.transactions.length}`)
}

const GENESIS_TD = 1
const GENESIS_HASH = Buffer.from(
  '6341fd3daf94b748c72ced5a5b26028f2474f5f00d824504e4fa37a75767e177',
  'hex'
)

const REMOTE_CLIENTID_FILTER = [
    'go1.5',
    'go1.6',
    'go1.7',
    'Geth/v1.7',
    'quorum',
    'pirl',
    'ubiq',
    'gmc',
    'gwhale',
    'prichain',
  ]  

const dpt = new DPT(Buffer.from(PRIVATE_KEY, 'hex'), {
  endpoint: {
    address: '0.0.0.0',
    udpPort: null,
    tcpPort: null,
  },
})

dpt.on('error', (err) => {
  //console.error(`DPT: ${err}`)
})

const rlpx = new RLPx(Buffer.from(PRIVATE_KEY, 'hex'), {
    dpt: null,
    //dpt,
    maxPeers: 25,
    capabilities: [LES.les4],
    common,
    remoteClientIdFilter: REMOTE_CLIENTID_FILTER,
})

rlpx.connect({id: Buffer.from('b6b28890b006743680c52e64e0d16db57f28124885595fa03a562be1d2bf0f3a1da297d56b13da25fb992888fd556d4c1a27b1f39d531bde7de1921c90061cc6', 'hex'), address: '159.89.28.211', tcpPort: 30303, udpPort: 30303})

rlpx.on('error', (err) => console.error(`RPLX: ${err}`))

rlpx.on('peer:added', (peer) => {
    const clientId = peer.getHelloMessage().clientId
    const addr = getPeerAddr(peer)
    const les = peer.getProtocols()[0]
    const requests = { headers: [], bodies: [] }
    console.log(
        `Add peer: ${clientId} ${addr} (total: ${rlpx.getPeers().length})`
    )

    les.sendStatus({
      headTd: int2buffer(17179869184), // total difficulty in genesis block
      headHash: GENESIS_HASH,
      genesisHash: GENESIS_HASH,
      headNum: Buffer.from([]),
      announceType: int2buffer(0),
      recentTxLookup: int2buffer(1),
      forkID: [Buffer.from('3b8e0691', 'hex'), int2buffer(1)],
    })

    les.once('status', (status) => {
      const msg = [
        Buffer.from([]),
        [buffer2int(status['headNum']), Buffer.from([30]), Buffer.from([]), Buffer.from([1])],
      ]

      les.on('message', async (code, payload) => {
        console.log(les._statusTimeoutId)

        console.log(`Code ${code}`)
  
        switch (code) {
          case LES.MESSAGE_CODES.BLOCK_HEADERS: {
            const headers = []
            for (let i = 0; i < payload[2].length; i++ ) {
              const header = BlockHeader.fromValuesArray(payload[2][i], { common })
  
              headers.push(header.hash())
              requests.bodies.push(header)
            }
  
  
            setTimeout(() => {
              les.sendMessage(LES.MESSAGE_CODES.GET_BLOCK_BODIES, [
                Buffer.from([payload[2].length]),
                headers,
              ])
            }, ms('0.1s'))
            break
          }
    
          case LES.MESSAGE_CODES.BLOCK_BODIES: {  
            let latestNumber
            for (let i = 0; i < payload[2].length; i++) {
              const header = requests.bodies.shift()
              const txs = payload[2][i][0]
              const uncleHeaders = payload[2][i][1]
              const block = Block.fromValuesArray([header.raw(), txs, uncleHeaders], { common })
              const isValid = await isValidBlock(block)
              let isValidPayload = false
              if (isValid) {
                isValidPayload = true
                onNewBlock(block, peer)
              }
      
              if (!isValidPayload) {
                console.log(`${addr} received wrong block body`)
              }
  
              latestNumber = block.header.number
            }
  
            setTimeout(() => {
              const msg = [
                Buffer.from([]),
                [latestNumber, Buffer.from([30]), Buffer.from([]), Buffer.from([1])],
              ]
              console.log(msg)
              les.sendMessage(LES.MESSAGE_CODES.GET_BLOCK_HEADERS, msg)
            }, ms('0.1s'))
  
            break
          }
        }
      })

      les.sendMessage(LES.MESSAGE_CODES.GET_BLOCK_HEADERS, msg)
    })
})

rlpx.on('peer:removed', (peer, reason, disconnectWe) => {
  console.log(
    `Remove peer: ${peer._remoteId.toString('hex')} (total: ${rlpx.getPeers().length})`
  )
  console.log(`Disconnect code : ${reason}, Disconnect we : ${disconnectWe}`)
})

console.log('what')

// for accept incoming connections uncomment next line
// dpt.bind(30303, '0.0.0.0')

/*for (const bootnode of BOOTNODES) {
    dpt.bootstrap(bootnode).catch((err) => console.error(err.stack || err))
}*/