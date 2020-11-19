const http = require('http')
const express = require('express')
const path = require('path')
const cors = require('cors')
const request = require('request')
const app = express()
const bodyParser = require('body-parser')
const { spawn, exec } = require('child_process');
const kill = require('tree-kill');
let port = process.env.PORT || 8001
const smHost = process.env.SM_HOST || 'http://localhost:7000'
const smToken = process.env.SM_TOKEN || 'abc123'
const maxRetries = process.env.MAX_SUBSCRIBE_RETRIES || 3
const maxFailures = process.env.MAX_FAILURES || 2
let checkInterval = process.env.CHECK_INTERVAL || 30000
const timeout = process.env.TIMEOUT || 15000
const baseWebPage = process.env.BASE_PAGE || 'http://127.0.0.1:8001/home'
const protocolsToCheck = process.env.PROTOCOLS || 'WEBRTC'
const concurrentChecks = process.env.CONCURRENT_CHECKS || 5

if (checkInterval <= timeout){
    console.log('CHECK_INTERVAL must be greater than TIMEOUT')
    return
}

console.log('Using:')
console.log('Stream Manager Host:', smHost)
console.log('Stream Manager Token:', smToken)
console.log('Max Subscribe Retries Per Health Check:', maxRetries)
console.log('Max Failures Before Sunsetting:', maxFailures)
console.log('Health Check Interval:', checkInterval)
console.log('Health Check Timeout:', timeout)
console.log('Concurrent Health Checks:', concurrentChecks)

let chromeProcesses = {}
let checkWebRTC = true
let checkHLS = false
let checkRTMP = false

let nodesToSunset = {}

app.use(bodyParser.json())
app.use(cors())
app.options('*', cors())

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*")
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
    next()
})

app.get('/home', function (req, res) {
    res.sendFile(path.join(__dirname,'/home.html'));
})

app.get('/css/*', function (req, res) {
    res.sendFile(path.join(__dirname,req.originalUrl));
})

app.get('/scripts/*', function (req, res) {
    res.sendFile(path.join(__dirname,req.originalUrl));
})

app.get('/lib/*', function (req, res) {
    res.sendFile(path.join(__dirname,req.originalUrl));
})

app.post('/report', function (req, res) {
    console.log(req.body)

    const nodeAddress = req.body.node
    const streamName = req.body.stream
    const groupId = req.body.groupId
    const timestamp = req.body.timestamp
    const isWebRTCWorking = req.body.isWebRTCWorking
    const isHLSWorking = req.body.isHLSWorking
    const isRTMPWorking = req.body.isRTMPWorking

    if (!Object.hasOwnProperty.call(chromeProcesses, timestamp) || !Object.hasOwnProperty.call(chromeProcesses[timestamp],groupId)) {
        console.log(`process with timestamp ${timestamp} and groupId ${groupId} not found`)
        return
    }

    const group = chromeProcesses[timestamp][groupId] 
    console.log(`Received report for timestamp ${timestamp}, group ${groupId}, node ${nodeAddress} and stream ${streamName}`)
    
    if ((!checkWebRTC || isWebRTCWorking) && (!checkHLS || isHLSWorking) && (!checkRTMP || isRTMPWorking)) {
        // it is working
        // remove node from list 
        group.edges = group.edges.filter(edge => edge != nodeAddress)
        if (Object.hasOwnProperty.call(nodesToSunset,nodeAddress)){
            delete nodesToSunset[nodeAddress]
        }
    }
    console.log(group.edges)

    res.send('report received')
})

const parseProtocolsToCheck = function (protocolsToCheck) {
    let protocols = []
    if (protocolsToCheck.indexOf('WEBRTC') < 0) {
        checkWebRTC = false
    }
    else {
        protocols.push('WEBRTC')
    }

    if (protocolsToCheck.indexOf('HLS') < 0) {
        checkHLS = false
    }
    else {
        protocols.push('HLS')
    }

    if (protocolsToCheck.indexOf('RTMP') < 0) {
        checkRTMP = false
    }
    else {
        protocols.push('RTMP')
    }
    console.log(`Checking protocols ${protocols.join(', ')}`)
}

const getContextAndStream = function(streamName){
    let index = streamName.lastIndexOf('/')
    return { context: streamName.substring(0, index), stream: streamName.substring(index+1) }
}

const spawnChromeProcess = function (groupId, edgeAddress, context, streamName, timestamp) {
    // todo uncomment for linux
    const process = 'google-chrome'
    // todo uncomment for windows
    //const process = 'chrome.exe'
    const webpage = `${baseWebPage}?sm=true&host=${smHost.substring(smHost.indexOf('/') + 2)}&node=${edgeAddress}&maxRetries=${maxRetries}&app=${context}&stream=${streamName}&groupId=${groupId}&timestamp=${timestamp}`
    const args = [
        '--autoplay-policy=no-user-gesture-required',
        '--headless',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        `${webpage}`
    ]

    const child = spawn(process, args, {
        stdio: 'ignore', // piping all stdio to /dev/null
        detached: true
    });

    if (!Object.hasOwnProperty.call(chromeProcesses, timestamp)){
        chromeProcesses[timestamp] = {}
    }
    const groups = chromeProcesses[timestamp]
    if (!Object.hasOwnProperty.call(groups, groupId)){
        groups[groupId] = {
            'pids':[],
            'edges':[]
        }    
        handleNoResponseFromChrome(groupId, timestamp)
    }
    groups[groupId].pids.push(child.pid)
    groups[groupId].edges.push(edgeAddress)

    child.on('close', async (code) => {
        console.log(`child process exited with code ${code}`);
        //child = null
    });

    child.on('error', async (chunk) => {
        console.log(chunk.toString('utf8'))
    });

    /*child.stderr.on('data', (chunk) => {
        console.log(chunk.toString('utf8'))
    });

    child.stdout.on('data', (chunk) => {
        console.log(chunk.toString('utf8'))
    });*/
}

const handleNoResponseFromChrome = function (groupId, timestamp) {
    setTimeout((groupId, timestamp) => {
        const group = chromeProcesses[timestamp][groupId] 
        if (group){
            killChrome(group.pids)
            const edges = group.edges
            handleEdgesToSunset(edges)
            delete chromeProcesses[timestamp][groupId]  
            if (Object.keys(chromeProcesses[timestamp]).length <= 0){
                delete chromeProcesses[timestamp]
            }
            console.log(JSON.stringify(chromeProcesses))
        }
    }, timeout, groupId, timestamp)
}

const handleEdgesToSunset = function (edges){
    if (!edges || edges.length <= 0){
        return 
    }

    console.log('Unresponsive edges '+edges.join(', '))
    const nodesToSunsetNow = []
    edges.forEach(edge => {
        if (Object.hasOwnProperty.call(nodesToSunset, edge)){
            if (nodesToSunset[edge] >= maxFailures){
                nodesToSunsetNow.push(edge)
                delete nodesToSunset[edge]
            }
            else {
                nodesToSunset[edge] += 1
            }
        }
        else if (maxFailures == 1){
            nodesToSunsetNow.push(edge)
            delete nodesToSunset[edge]
        }
        else {
            nodesToSunset[edge] = 2
        }
    })

    if (nodesToSunsetNow.length > 0){
        console.log('Sunset edges '+nodesToSunsetNow.join(', '))
        // TODO uncomment 
        sunsetNodes(nodesToSunsetNow)
    }
    
}

const killChrome = function (pids) {
    if (pids) {
        pids.forEach((pid) => kill(pid))
        console.log('killed chrome processes with pids ' + pids.join(', '))
    }
}

const sunsetNodes = function (nodes) { 
    const url = `${smHost}/streammanager/api/4.0/admin/node/sunset?accessToken=${smToken}`
    makePostJsonRequest(url, nodes)
        .then(() => {
            console.log('Reported nodes ', nodes)
        })
        .catch((error) => {
            console.log('Received error when reporting nodes to sunset')
            console.log(error)
        })
}

const getActiveNodeGroups = function () {
    const groups = []
    const url = `${smHost}/streammanager/api/4.0/admin/nodegroup?accessToken=${smToken}`

    return new Promise((resolve, reject) => {
        makeGetRequest(url)
            .then((body) => {
                const jsonNodeGroups = JSON.parse(body)
                jsonNodeGroups.forEach(nodeGroup => {
                    if (nodeGroup.state === 'active') {
                        groups.push(nodeGroup.name)
                    }
                });
                resolve(groups)
            })
            .catch((error) => {
                console.log('Received error when getting active node groups')
                console.log(error)
                reject(error)
            })
    })
}

const getNodesInNodeGroup = function (nodeGroupName) {
    const nodes = {
        "transcoder": [],
        "origin": [],
        "relay": [],
        "edge": []
    }

    const url = `${smHost}/streammanager/api/4.0/admin/nodegroup/${nodeGroupName}/node?accessToken=${smToken}`

    return new Promise((resolve, reject) => {
        makeGetRequest(url)
            .then((body) => {
                const jsonNodes = JSON.parse(body)
                jsonNodes.forEach(node => {
                    if (node.state === 'inservice') {
                        nodes[node.role].push(node.address)
                    }
                });
                resolve(nodes)
            })
            .catch((error) => {
                console.log('Received error when getting nodes in node group ' + nodeGroupName)
                console.log(error)
                reject(error)
            })
    })
}

const makeGetRequest = async function (url) {
    return new Promise((resolve, reject) => {
        request.get(
            url,
            function (error, response, body) {
                if (!error && response && response.statusCode && response.statusCode < 300) {
                    resolve(body)
                }
                else {
                    console.log(error)
                    reject({ error, 'response': response })
                }
            }
        )
    })
}

const makePostJsonRequest = async function (url, payload) {
    return new Promise((resolve, reject) => {
        request.post(
            url,
            {
                json: payload
            },
            function (error, response, body) {
                if (!error && response.statusCode < 300) {
                    console.log('success')
                    resolve(body)
                }
                else {
                    console.log(error)
                    reject(error)
                }
            }
        )
    })
}

const getEdges = function () {
    return new Promise((resolve, reject) => {
        getActiveNodeGroups()
            .then(async groups => {
                if (groups.length <= 0){
                    return
                }

                let allEdges = []
                const promises = []
                promises.push(new Promise((resolve, reject) => {
                    groups.forEach(async group => {
                        const nodesInGroup = await getNodesInNodeGroup(group)
                        //console.log('Found nodes in group ' + group, nodesInGroup)
                        nodesInGroup['edge'] ? resolve(nodesInGroup['edge']) : resolve([])
                    })
                }))

                Promise.all(promises)
                    .then(edges => {
                        edges.forEach(edgeList => {
                            allEdges = allEdges.concat(edgeList)
                        })
                        resolve(allEdges)
                    })
                    .catch((error) => {
                        reject(error)
                    })
            })
            .catch((error) => {
                console.log(error)
            })
    })
}

const checkEdgesHealth = function (streamName, edges) {
    console.log(`Checking health of edges: ${edges.join(', ')}`)
    const timestamp = new Date().getTime()
    let groupId = Math.floor(Math.random() * 0x10000).toString(16)
    const {context, stream} = getContextAndStream(streamName)
    let count = 0
    let group = 0
    edges.forEach(edge => {
        if (count >= concurrentChecks){
            groupId = Math.floor(Math.random() * 0x10000).toString(16)
            count = 0
            group++
        }

        setTimeout((groupId, edge, context, stream, timestamp) => {
            spawnChromeProcess(groupId, edge, context, stream, timestamp)
        }, group * timeout, groupId, edge, context, stream, timestamp)
        count++
    })
}

const getStreamToCheck = function () {
    return new Promise((resolve, reject) => {
        const url = `${smHost}/streammanager/api/4.0/event/list`
        makeGetRequest(url)
            .then(response => {
                const jsonResponse = JSON.parse(response)
                const streamMap = {}
                jsonResponse.forEach(item => {
                    streamMap[`${item.scope}/${item.name}`] = true
                })
                const keys = Object.keys(streamMap)
                if (keys.length <= 0) {
                    return resolve(null)
                }
                const randomIndex = Math.floor(Math.random() * keys.length)
                const streamToCheck = keys[randomIndex]
                console.log(streamToCheck)
                resolve(streamToCheck)
            })
            .catch(error => {
                console.log(error)
                reject(error)
            })
    })
}

const periodicHealthCheck = async function () {
    const edges = await getEdges()
    let minimumCheckInterval = Math.floor((edges.length / concurrentChecks ) * timeout) + 500
    if (minimumCheckInterval > checkInterval){
        console.log('Adjusted check interval to ' + minimumCheckInterval)
        checkInterval = minimumCheckInterval
    }
    const streamToCheck = await getStreamToCheck()
    if (streamToCheck && edges.length > 0) {
        console.log(`Check edges ${edges.join(', ')} using stream ${streamToCheck}`)
        checkEdgesHealth(streamToCheck, edges)
    }

    setTimeout(() => {
        periodicHealthCheck()
    }, checkInterval)
}


// Main
parseProtocolsToCheck(protocolsToCheck)

let server = http.createServer(app)
server.listen(port)

console.log('Node.js Server running on ' + port + '.')

periodicHealthCheck()