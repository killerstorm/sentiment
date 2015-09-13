// balance monitoring.
// there are approximately three possible ways to do it:
// 1. scan new transactions in the blockchain looking for those which touch our addresses
// 2. get notification from some service which monitors the blockchain
// 3. batch mode, do updates periodically
//
// We will use chromanode notification mechanism for now, but at some point it becomes more efficient 
// to do the blockchain monitoring ourselves.

var core = require('./core')

function BalanceMonitor (storage, connector) {
  this.storage = storage  
  this.connector = connector
}

BalanceMonitor.prototype.updateAddressBalance = function (address, subscribe) {
  var self = this
  if (subscribe) {
    self.connector.subscribe({event: "touchAddress", address: address})
  }    
  return core.computeAddressBalance(address)
      .then(function (balance) {
        return self.storage.updateAddressBalance(address, balance)
      })
}

BalanceMonitor.prototype.init = function () {
  var self = this
  this.connector.on('touchAddress', function (address, txid) {
    self.updateAddressBalance(address)                      
  })

  this.storage.getAllAddresses().map(function (address) {
    return self.updateAddressBalance(address, true)
  }, {concurrency: 1})
}

module.exports = BalanceMonitor