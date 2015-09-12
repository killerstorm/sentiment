var bitcore = require('bitcore')
var blockchainjs = require('blockchainjs')
require('bitcore-message')
var Promise = require('bluebird')
var _ = require('lodash')

exports.computeMessageHash = function (message) {
  return bitcore.crypto.Hash.sha256(new Buffer(message))
                     .toString('hex')
}

exports.computeStatement = function (messageHash, verb) {
  return "sentiment:" + verb + ":" + messageHash
}

exports.verifySignature = function (address, signature, statement) {
  return bitcore.Message(statement).verify(address, signature)
}

var connector = new blockchainjs.connector.Chromanode()

exports.computeAddressBalance = function (address) {
  return connector.addressesQuery([address], {status: 'unspent'})
      .then(function (data) {
        return _.sum(_.filter(data.unspent, 'height'),
              function (unspent) { return parseInt(unspent.value)  })
      })
}
