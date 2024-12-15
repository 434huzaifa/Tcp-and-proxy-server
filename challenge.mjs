import net from 'node:net';

class TCPProxy {
  constructor(localPort, targetHost, targetPort) {
    this.localPort = localPort;
    this.targetHost = targetHost;
    this.targetPort = targetPort;
    this.secret = "i like big trains and i cant lie".split(" ");
    this.secretMatchedIndex = 0
    this.buffer = []
    this.isHold = true
    this.firstResponseLastIdx = -1
  }

  // Method to modify the response (override this with your custom logic)

  handleReturn(edited = false) {
    if (this.firstResponseLastIdx != -1 && edited) {
      const result = this.buffer.splice(0, this.firstResponseLastIdx)
      return result.join(" ");
    }
    return this.buffer.join(" ");
  }
  modifyResponse(data, isLast = false) {
    if (this.buffer.length == 0 && !isLast) {
      this.buffer = data.toString().split(" ");
    } else if (!isLast) {
      this.firstResponseLastIdx = this.buffer.length
      const t_data = data.toString().split(" ");
      this.buffer = [...this.buffer, ...t_data]
    }
    if (!this.isHold) {
      if (this.buffer.length >= this.secret.length) {
        let idxList = []
        let t_idxList = []
        let matchedIdx = 0
        for (let idx = 0; idx < this.buffer.length; idx++) {
          let b_item = this.buffer[idx]
          if (b_item == "\n" && this.buffer.length - 1 > idx) {
            continue
          }
          let isPartialMatched = false
          let isNewLine = false
          if (b_item.includes("\n") && this.buffer.length - 1 > idx) {
            b_item = b_item.replace("\n", "")
            if (!this.secret.includes(b_item)) {
              b_item += this.buffer[idx + 1]
              isNewLine = true
            }
          }

          if (b_item == this.secret[matchedIdx] && matchedIdx < this.secret.length) {
            matchedIdx++
            t_idxList.push(idx)
            if (isNewLine) {
              t_idxList.push(idx + 1)
              isPartialMatched = true
              isNewLine = false
            }
            if (matchedIdx == this.secret.length) {

              idxList = [...idxList, ...t_idxList]
              t_idxList = []
              matchedIdx = 0
            }
          } else if (b_item == this.secret[0]) {
            matchedIdx = 1
            t_idxList = []
            t_idxList.push(idx)

          } else {
            t_idxList = []
            matchedIdx = 0
          }
          if (isPartialMatched) {
            idx++
            isPartialMatched = false
          }
        }
        matchedIdx = 0
        if (idxList.length > 0) {
          for (let idx = 0; idx < idxList.length; idx++) {
            const b_element = this.buffer[idxList[idx]];
            if (b_element.includes("\n") && b_element.length > 1) {
              this.buffer[idxList[idx]] = this.buffer[idxList[idx]].replace("\n", "");
              this.buffer[idxList[idx]] = `${"-".repeat((b_element.length - 1))}\n`
            } else {
              this.buffer[idxList[idx]] = "-".repeat(b_element.length)
            }
          }
          return this.handleReturn(true)
        } else {
          return this.handleReturn(true)
        }
      } else {
        return this.handleReturn()
      }
    }
  }

  start() {
    // Create a server that will listen for incoming connections
    const server = net.createServer((clientSocket) => {

      // Flag to track if initial parameter has been sent
      let initialParameterSent = false;

      // Connect to the target server
      const targetSocket = new net.Socket();
      targetSocket.connect(this.targetPort, this.targetHost, () => {

        // Send initial parameter on first connection
        const initialParam = 'a'; // Hardcoded initial parameter
        targetSocket.write(initialParam);
        initialParameterSent = true;

        // Handle data from client to target server
        clientSocket.on('data', (data) => {

          // If initial parameter hasn't been sent, prepend it
          if (!initialParameterSent) {
            const combinedData = Buffer.concat([Buffer.from(initialParam), data]);
            targetSocket.write(combinedData);
            initialParameterSent = true;
          } else {
            targetSocket.write(data);
          }
        });

        // Handle data from target server to client
        targetSocket.on('data', (data) => {
          // Send modified data back to client

          let modifiedData = this.modifyResponse(data);
          if (this.isHold) {
            this.isHold = false
          } else {
            clientSocket.write(Buffer.from(modifiedData));
            this.firstResponseLastIdx = -1
          }
        });
        // Handle connection closures
        clientSocket.on('close', () => {
          console.log('Client connection closed');
          this.buffer = []
          this.firstResponseLastIdx = -1
          this.isHold = true
          targetSocket.destroy();
        });

        targetSocket.on('close', () => {
          console.log('Target server connection closed');
          if (this.buffer.length > 0) {
            let modifiedData = this.modifyResponse(this.buffer, true);
            clientSocket.write(Buffer.from(modifiedData));
          }
          this.buffer = []
          this.firstResponseLastIdx = -1
          this.isHold = true
          clientSocket.destroy();
        });
      });

      // Handle connection errors
      targetSocket.on('error', (err) => {
        console.log('targetSocket Error: ', err);
        clientSocket.destroy();
      });

      clientSocket.on('error', (err) => {
        console.error('clientSocket  error:', err);
        targetSocket.destroy();
      });
    });

    // Start listening on the specified local port
    server.listen(this.localPort, () => {
      console.log(`Proxy server listening on port ${this.localPort}`);
    });

    // Handle server errors
    server.on('error', (err) => {
      console.error('Proxy server error:', err);
    });
  }
}

// Example usage
const proxy = new TCPProxy(
  3031,           // Local port the proxy will listen on
  'localhost',    // Target host
  3032          // Target port
);

proxy.start();