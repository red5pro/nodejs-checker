# Node Checker 
This is a Node.js server that can be used to verify that all Edges of a Stream Manager are working as expected. The server will periodically get the list of `inservice` edges and for each of them start a chrome instance that will subscribe using that edge and a stream name randomly selected from the list of active ones. If the subscribe attempt fails the edge will be reported to the Stream Manager using the sunsetting API.  
The integration of the Stream Manager and the details of the sunsetting API can be found in the [Red5 Pro Documentation Site](https://www.red5pro.com/docs/autoscale/corrupted-node/installing-the-node-checker/)

# Installing the Node.js server

This server will need to be installed on its own instance and run 24/7. 

Install Google Chrome with the following commands:
```sh 
$ wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
$ sudo apt install ./google-chrome-stable_current_amd64.deb
```

Install Nodejs using the following commands:
```sh
$ sudo apt-get update
$ curl -sL https://deb.nodesource.com/setup_8.x -o nodesource_setup.sh
$ sudo bash nodesource_setup.sh
$ sudo apt-get install -y nodejs
$ sudo apt-get install build-essential
$ sudo npm install forever -g
```

Then `cd` into the folder of the mock server and install the dependencies as follows:
```sh
npm install
```

> If you are logged in as the root user you will need to create a new user with non-root priviledges to run the Node.js server. That is because Node.js internally starts a Chrome process but Chrome won't start for security reasons if Node.js is running under the root user. 

The server can be started with the following command:
```sh
PORT=<Node-js-Port> SM_HOST=<Hostname-of-Stream-Manager> SM_TOKEN=<Token-Of-Stream-Manager> MAX_SUBSCRIBE_RETRIES=<Max-Retries> MAX_FAILURES=<Max-Failures> CHECK_INTERVAL=<Check-Interval> TIMEOUT=<Timeout> CONCURRENT_CHECKS=<Concurrent-Checks> forever start index.js
```
Where:
* PORT - The Port used by the Node.js server - defaults to `8001`.
* SM_HOST - The Hostname of the Stream Manager including `https://`.
* SM_TOKEN - The Token of the Stream Manager.
* MAX_SUBSCRIBE_RETRIES - The number of times the HTML5 player will retry to subscribe to the provided live stream using the provided edge before reporting it as bad to the Node.js server - defaults to `3`.
* MAX_FAILURES - The number of health checks that a node can fail before being reported to the Stream Manager - defaults to `2`. It should be noted that the player may try to subscribe just before a stream is unpublished, and thus making the edge fail the health check as a result. Therefore, it is recommended to check at least twice before reporting to the Stream Manager. Every time a node has a good health check (it can successfully subscribe), the health check failure counter of the node is reset to `0`.
* TIMEOUT - The maximum time in milliseconds given to the Chrome Instance to report if it could subscribe or not - defaults to `15000` milliseconds. 
* CHECK_INTERVAL - The period of the health checks in milliseconds - defaults to `30000` milliseconds.
* CONCURRENT_CHECKS - The maximum number of Edges that the Nodejs server can check at the same time - defaults to `5`. It should be noted that the server will create `<CONCURRENT_CHECKS>` Chrome instances at the same time. If there are more edges than `<CONCURRENT_CHECKS>` then they will be divided in groups of size smaller or equal to `<CONCURRENT_CHECKS>`. When more groups are used, the Nodejs server may increase the value of `<CHECK_INTERVAL>` to guarantee that there are never more than `<CONCURRENT_CHECKS>` chrome instances. In general `CHECK_INTERVAL > ((# of edges / <CONCURRENT_CHECKS>) * <TIMEOUT>)`

# Installing the Stream Manager 

The Stream Manager needs to have the CORS open to allow the Chrome process created by the Node.js server to be able to subscribe to the live streams. The Chrome process will load the subscribe page from the domain `http://127.0.0.1:8001/home`. 

CORS can be configured in the Stream Manager instances by modifying `{Red5-Pro}/webapps/streammanager/WEB_INF/web.xml` and adding the following lines:
```
<!-- CORS filter with wideopen origin by default -->
<filter>
    <filter-name>CORS</filter-name>
    <filter-class>com.thetransactioncompany.cors.CORSFilter</filter-class>
    <async-supported>true</async-supported>
    <init-param>
        <param-name>cors.allowOrigin</param-name>
        <param-value>https://<streammanagerurl>, http://<nodecheckerip>:8001, http://127.0.0.1:8001</param-value>
    </init-param>
    <init-param>
        <param-name>cors.allowSubdomains</param-name>
        <param-value>true</param-value>
    </init-param>
    <init-param>
        <param-name>cors.supportedMethods</param-name>
        <param-value>GET, POST, DELETE, HEAD</param-value>
    </init-param>
    <init-param>
        <param-name>cors.maxAge</param-name>
        <param-value>3600</param-value>
    </init-param>
</filter>
<filter-mapping>
    <filter-name>CORS</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
```
