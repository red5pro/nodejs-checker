const WS = window.WebSocket

window.WebSocket = class MockWebsocket extends WS {
  constructor (url) {
    if (url.match(/streammanager/)) {
      const stripped = url.replace('/streammanager', '/live')
      return new WS(stripped)
    }
    return new WS(url)
  }
}

window.fetch = (url) => {
  const isStreamListRequest = url.match(/streammanager\/api\/4\.0\/event\/list/)
  const isOriginRequest = url.match(/\?action=broadcast/)
  const isEdgeRequest = url.match(/\?action=subscribe/)
  const streamJson = {
    serverAddress: 'localhost',
    scope: 'live',
    name: 'stream1'
  }
  const streamListJson = [
    {
        'type': 'edge',
        'name': 'stream1',
        'scope': 'live',
        'serverAddress': 'localhost',
        'region': 'us-east-1'
    },
    {
        'type': 'edge',
        'name': 'stream1_1',
        'scope': 'live',
        'serverAddress': 'localhost',
        'region': 'us-east-1'
    }
  ]
  let payload
  if (isOriginRequest || isEdgeRequest) {
    payload = streamJson
  } else if (isStreamListRequest) {
    payload = streamListJson
  } else {
    console.log(`Could not mock request on fetch: ${url}`)
  }
  var response = {
    status: 200,
    headers: {
      get: (type) => {
        if (type === 'content-type') return 'application/json'
      }
    },
    json: () => {
      return new Promise(resolve => {
        resolve(payload)
      })
    }
  }
  return new Promise(resolve => {
    resolve(response)
  })
}
