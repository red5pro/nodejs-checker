(window => {

  const getIsAvailable = async (url, streamName) => {
    try {
      const isAvailable = await window.getIsStreamAvailable(url, streamName, true)
      return isAvailable
    } catch (e) {
      console.error(e)
      return false
    }
  }

  const getStreamList = async (url, scope) => {
    try {
      const list = await window.getStreamList(url)
      const filtered = list.filter(item => {
        return item.scope === scope && item.type === 'edge'
      })
      return filtered
    } catch (e) {
      throw e
    }
  }

  const getOrigin = async (host, context, streamName) => {
    try {
      const url = `https://${host}/streammanager/api/4.0/event/${context}/${streamName}?action=broadcast`
      const result = await fetch(url)
      const json = await result.json()
      if (json.errorMessage) {
        throw new Error(json.errorMessage)
      }
      return json
    } catch (e) {
      throw e
    }
  }

  const getEdge = async (host, context, streamName) => {
    try {
      const url = `https://${host}/streammanager/api/4.0/event/${context}/${streamName}?action=subscribe`
      const result = await fetch(url)
      const json = await result.json()
      if (json.errorMessage) {
        throw new Error(json.errorMessage)
      }
      return json
    } catch (e) {
      throw e
    }
  }

  window.streamManagerUtil = {
    getIsStreamAvailable: getIsAvailable,
    getStreamList: getStreamList,
    getOrigin: getOrigin,
    getEdge: getEdge
  }

})(window)
