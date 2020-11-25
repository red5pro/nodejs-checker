# Node Checker 
The Node Checker is a stand alone Node.js server that can be deployed along a Red5 Pro Autoscaling environment to monitor the Red5 Pro Edges and guarantee that WebRTC is working for all of them. If a problem is found on a certain Edge, the node Checker will report it to the Stream Manager that will stop forwarding new clients to it. Moreover, a new Edge instance will be created to compensate for the loss in capacity. When an Edge is reported, the Stream Manager will monitor its existing clients and once all of them disconnect, the Stream Manager will proceed to remove the Edge.  

The Node Checker checks the health of the Edges by periodically retrieving the list of `inservice` Edges using the Stream Manager API and the list of published streams. If at least one Edge and one stream are found, a live stream is randomly selected from the list and an attempt is made to subscribe to that live stream using every Edge. The health check is run on a single live stream because it has been observed that when an Edge is unresponsive for one stream, it is unresponsive for the others as well. The subscribe attempt consists in having the Node Checker launch a Google Chrome instance that will load a locally served HTML5 page. The URL of the page will include the IP of the Edge server to use and the stream name to subscribe to along with the maximum number of retries. Once the page can successfully subscribe, or it reaches the maximum number of retries, it will call a REST API exposed by the Node Checker to inform it whether it was able to subscribe or not. If the Node Checker is informed that the page could not subscribe, or the page does not repond within a maximum timeout, the Node Checker will flag the Edge as unresponsive and after a configurable number of unresponsive health checks, the Node Checker will report the unresponsive Edge to the Stream Manager using a dedicated API.

# Installing the Node Checker

It is recommended to install the Node Checker in a dedicated instance that will run non-stop to continuously monitor a Red5 Pro deployment. 

The Node Checker can be dowloaded [here - TODO ADD DOWNLOAD LINK HERE](). 

Google Chrome can be installed on the instance with the following commands:
```sh 
$ wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
$ sudo apt install ./google-chrome-stable_current_amd64.deb
```

Node.js can be installed using the following commands:
```sh
$ sudo apt-get update
$ curl -sL https://deb.nodesource.com/setup_8.x -o nodesource_setup.sh
$ sudo bash nodesource_setup.sh
$ sudo apt-get install -y nodejs
$ sudo apt-get install build-essential
$ sudo npm install forever -g
```

The dependencies can be installed by running the following command inside the folder of the Node Checker server:
```sh
npm install
```

> If you are logged in as the root user you will need to create a new user to run the Node Checker server. That is because the Node Checker internally starts a Chrome process but Chrome will not start for security reasons if the Node Checker is running under the root user. 

The Node Checker server can be started with the following command:
```sh
PORT=<Node-Checker-Port> SM_HOST=<Hostname-of-Stream-Manager> SM_TOKEN=<Token-Of-Stream-Manager> MAX_SUBSCRIBE_RETRIES=<Max-Retries> MAX_FAILURES=<Max-Failures> CHECK_INTERVAL=<Check-Interval> TIMEOUT=<Timeout> CONCURRENT_CHECKS=<Concurrent-Checks> forever start index.js
```

Where:
* PORT - The Port used by the Node Checker server - defaults to `8001`.
* SM_HOST - The Hostname of the Stream Manager including `https://`.
* SM_TOKEN - The Token of the Stream Manager.
* MAX_SUBSCRIBE_RETRIES - The number of times the HTML5 player will retry to subscribe to the provided live stream using the provided edge before reporting it as bad to the Node Checker server - defaults to `3`.
* MAX_FAILURES - The number of health checks that a node can fail before being reported to the Stream Manager - defaults to `2`. It should be noted that the player may try to subscribe just before a stream is unpublished, and thus making the Edge fail the health check as a result. Therefore, it is recommended to check at least twice before reporting to the Stream Manager. Every time a node has a good health check (it can successfully subscribe), the health check failure counter of the node is reset to `0`.
* TIMEOUT - The maximum time in milliseconds given to the Chrome Instance to report if it could subscribe or not - defaults to `15000` milliseconds. 
* CHECK_INTERVAL - The period of the health checks in milliseconds - defaults to `30000` milliseconds.
* CONCURRENT_CHECKS - The maximum number of Edges that the Node Checker server can check at the same time - defaults to `5`. It should be noted that the server will create `<CONCURRENT_CHECKS>` Chrome instances at the same time. If there are more Edges than `<CONCURRENT_CHECKS>`, then they will be divided in groups of size smaller or equal to `<CONCURRENT_CHECKS>`. When there are more than one group, the Node Checker server may increase the value of `<CHECK_INTERVAL>` to guarantee that there are never more than `<CONCURRENT_CHECKS>` Google Chrome instances at any given time. In general `CHECK_INTERVAL > ((# of edges / <CONCURRENT_CHECKS>) * <TIMEOUT>)`

# Stream Manager Configuration

The Stream Manager needs to have CORS configured to allow the Chrome process created by the Node Checker server to be able to subscribe to the live streams. The Chrome process will load the subscribe page from the local domain `http://127.0.0.1:8001/home`. CORS can be configured in the Stream Manager instances by modifying `{Red5-Pro}/webapps/streammanager/WEB-INF/web.xml` and adding the following lines:
```
<!-- CORS filter -->
<filter>
    <filter-name>CORS</filter-name>
    <filter-class>com.thetransactioncompany.cors.CORSFilter</filter-class>
    <async-supported>true</async-supported>
    <init-param>
        <param-name>cors.allowOrigin</param-name>
        <param-value>http://127.0.0.1:8001/home</param-value>
    </init-param>
    <init-param>
        <param-name>cors.allowSubdomains</param-name>
        <param-value>true</param-value>
    </init-param>
    <init-param>
        <param-name>cors.supportedMethods</param-name>
        <param-value>*</param-value>
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

# Stream Manager API
A new API has been added to the Stream Manager to allow the Node Checker, or a user, to report an Edge server that is not propery working. When the Edge is reported, the Stream Manager will stop forwarding new subscribers to it and it will create a new Edge to compensate for the capacity loss. At the same time, the Stream Manager will monitor the existing clients of a reported Edge and once all of them disconect, it will remove the Edge. 

```
URL: https://<Stream-Manager-Hostname>/streammanager/api/4.0/admin/node/sunset?accessToken=<Stream-Manager-Token>
METHOD: POST
BODY:
[
    <Unresponsive-Edge-IP-1>,
    <Unresponsive-Edge-IP-2>,
    ...
    <Unresponsive-Edge-IP-n>
]
```
