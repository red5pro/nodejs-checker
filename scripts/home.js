((window, red5prosdk) => {

  red5prosdk.setLogLevel('debug')

  const RETRY_DELAY = 3000

  const appContext = window.getParamByName('app') || `live`
  const sm = window.getParamByName('sm')
  const requiresStreamManager = !sm ? false : !(sm && sm === 'false')
  const host = window.getParamByName('host') || 'localhost'
  const nodejsHost = window.getParamByName('nodejsHost') || 'localhost:8001'
  const edge = window.getParamByName('node') || 'localhost'
  const streamName = window.getParamByName('stream') || 'stream1'
  const groupId = window.getParamByName('groupId') || ''
  const timestamp = window.getParamByName('timestamp') || ''
  const username = window.getParamByName('username') || 'default-username'
  const password = window.getParamByName('password') || 'default-password'
  const token = window.getParamByName('token') || 'default-token'
  const maxRetries = window.getParamByName('maxRetries') || 3

  const subscriberId = 'red5pro-subscriber'
  const updateStatusFromEvent = window.red5proHandleSubscriberEvent;
  const container = document.querySelector('.subscriber-container')
  const details = document.querySelector('.subscriber-details')
  const streamNameText = document.querySelector('#stream-name')
  streamNameText.innerHTML = `Subscribing to stream ${streamName}`
  const errorInfo = document.querySelector('.subscriber-error')
  let subscriber

  let protocol = 'http:'
  if (requiresStreamManager){
      protocol = 'https:'
  }
  else if (host.indexOf('localhost') < 0 && host.indexOf('127.0.0.1') < 0){
    protocol = 'https:'
  }
  
  const secureConnection = protocol === 'https:'
  const subscriberConfig = {
    host: host,
    app: appContext,
    protocol: secureConnection ? 'wss' : 'ws',
    port: secureConnection ? '443' : 5080,
    connectionParams: {
        username,
        password,
        token
    },
    streamName: streamName,
    mediaElementId: subscriberId
  }
  let smConfig = {...subscriberConfig, ...{
    app: 'streammanager'
  }}

  const addLoadingIcon = (parent) => {
    const loadingIcon = document.createElement('img')
    loadingIcon.src = 'css/assets/loading.svg'
    loadingIcon.classList.add('stream-play-button')
    loadingIcon.classList.add('loading-icon')
    parent.appendChild(loadingIcon)
  }
  
  const removeLoadingIcon = (parent) => {
    const el = parent.querySelector('.loading-icon')
    if (el) {
      el.parentNode.removeChild(el)
    }
  }

  const enableStartPlayback = () => {
    setActiveLayout(false)
  }

  const enableStopPlayback = () => {
    setActiveLayout(true)
  }
  
  // eslint-disable-next-line no-unused-vars
  const setActiveLayout = (flag) => {
    // TODO?
  }

  // eslint-disable-next-line no-unused-vars
  const setFullscreenLayout = (flag) => {
    // TODO?
  }
  
  const displayError = (message) => {
    errorInfo.innerText = `Error: ${message}`
    errorInfo.classList.remove('hidden')
    console.error(message)
  }

  const displayDetails = (info) => {
    details.innerText = info
    details.classList.remove('hidden')
  }

  const onVideoElementPlayback = (event) => {
    event.target.removeEventListener('canplay', onVideoElementPlayback)
    removeLoadingIcon(container)
  }
  
  
  const onSubscriberEvent = (event) => {
    if (event.type === 'Subscribe.Time.Update') return
    console.log(`[Subscriber:Event]:: ${event.type}`)
    if (event.type === 'Connect.Failure' ||
      event.type === 'Subscribe.Fail' ||
      event.type === 'Subscribe.InvalidName') {
      displayError(event.type)
    } else if (event.type === 'Subscribe.Play.Unpublish' ||
      event.type === 'Subscribe.Connection.Closed') {
      retryConnection()
    } else if (event.type === 'Subscribe.VideoDimensions.Change') {
      const {
        data: {
          width,
          height
        }
      } = event
      const vh = (window.innerHeight - 140)
      // eslint-disable-next-line no-unused-vars
      const desiredHeight = Math.min(vh, height)
//      container.style.height = document.querySelector(`#${subscriberId}`).style.height = `${desiredHeight}px`
      displayDetails(`Broadcast dimensions: ${width}, ${height}`)
    }
    else if (event.type === 'Subscribe.Start'){
      console.log('success')
      postReport(true)
      setTimeout(() => {
        stopSubscribing()
      }, 5000)
    }

    updateStatusFromEvent(event);
  }

  const postReport = function(isWebRTCWorking){
    const hostname = nodejsHost.indexOf('localhost') >= 0 ? `http://${nodejsHost}` : `https://${nodejsHost}` 
    const url = `${hostname}/report`
    fetch(url, {
      method: 'post',
      headers: {
        "Content-type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        node: edge,
        stream: streamName,
        groupId,
        timestamp,
        isWebRTCWorking
      })
    })
    .then(function () {
      console.log('Request succeeded');
    })
    .catch(function (error) {
      console.log('Request failed', error);
    });
  }

  const startSubscribing = async () => {

    try {
      errorInfo.classList.add('hidden')
      removeLoadingIcon(container)
      addLoadingIcon(container)
      document.querySelector(`#${subscriberId}`).addEventListener('canplay', onVideoElementPlayback)
      let url
      const { 
        host,
        app,
        protocol,
        port
      } = subscriberConfig
      if (requiresStreamManager) {
        url = `https://${host}/streammanager/api/4.0/event/list`
      } else {
        url = `${protocol === 'wss' ? 'https' : 'http'}://${host}:${port}/${app}/streams.jsp`
      }
      const available = await window.getIsStreamAvailable(url, streamName, requiresStreamManager) 
      if (!available) {
        throw Error(`Stream ${streamName} not available.`)
      }

      if (!subscriber) {
        await setUpSubscriber()
      }
      await subscriber.subscribe()
      enableStopPlayback()

    } catch (e) {
      displayError(e.hasOwnProperty('message') ? e.message : e)
      document.querySelector(`#${subscriberId}`).removeEventListener('canplay', onVideoElementPlayback)
      enableStartPlayback()
      addLoadingIcon(container)
      retryConnection()
    }
  }
  
  const stopSubscribing = async () => {
    document.querySelector(`#${subscriberId}`).removeEventListener('canplay', onVideoElementPlayback)
    try {
      removeLoadingIcon(container)
      if (subscriber) {
        subscriber.off('*', onSubscriberEvent)
        await subscriber.unsubscribe()
        subscriber = undefined
        return true
      }
    } catch (e) {
      subscriber = undefined
      throw e
    }
  }

  const setUpSubscriber = async () => {

    try {

      subscriberConfig.subscriptionId = 'subscriber-' + Math.floor(Math.random() * 0x10000).toString(16)
      if (requiresStreamManager) {
        const serverAddress = edge //await window.streamManagerUtil.getEdge(subscriberConfig.host, appContext, subscriberConfig.streamName)
        /*const {
          serverAddress
        } = subscriberSM*/
        smConfig.connectionParams = {...subscriberConfig.connectionParams, ...{
          host: serverAddress,
          app: appContext
        }}
      }

      const sub = new red5prosdk.Red5ProSubscriber()
      subscriber = await sub.setPlaybackOrder(['rtc', 'rtmp', 'hls']).init({
        rtc:  requiresStreamManager ? smConfig : subscriberConfig
      })
      subscriber.on('*', onSubscriberEvent)

      return subscriber

    } catch (e) {
      displayError(e.mssage)
      throw e
    }

  }

  let t
  let retries = 1
  const retryConnection = async () => {
    if (retries > maxRetries){
      return 
    }
    
    retries++
    try {
      clearTimeout(t)
      await stopSubscribing()
      t = setTimeout(() => {
        clearTimeout(t)
        startSubscribing()
      }, RETRY_DELAY)
    } catch (e) {
      console.error(e)
      retryConnection()
    }
  }

  startSubscribing()

})(window, window.red5prosdk)