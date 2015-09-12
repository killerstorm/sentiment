var Promise = require('bluebird')
var pg = Promise.promisifyAll(require('pg'))

function Storage (opts) {
  this._url = opts.url
}

Storage.prototype.insertMessage = function (message, message_hash) {
  return this.executeQuery(
    "INSERT INTO messages (message, hash) VALUES ($1, $2)",
    [message, message_hash])
}

Storage.prototype.insertSignature = function (address, verb, signature, 
  message_hash) {
  return this.executeQuery(
    "INSERT INTO signatures (address, verb, signature, message_hash) VALUES ($1, $2, $3, $4)",
    [address, verb, signature, message_hash])
}

Storage.prototype.updateAddressBalance = function (address, balance) {
  return this.executeQuery(
    "SELECT update_address_balance($1, $2)",
    [address, balance])
}

Storage.prototype.getVotes = function (message_hash, verb) {
  return this.executeQuery(
    "SELECT address, balance FROM signatures INNER JOIN address_balances USING (address)"
    + "WHERE message_hash = $1 AND verb = $2"
    [message_hash, verb])
}

Storage.prototype.getMessageByHash = function (message_hash) {
  return this.executeQuery(
    "SELECT message FROM messages WHERE hash = $1",
    [message_hash]
  ).then(function (res) {
    if (res.rows.length)
      return res.rows[0].message
    else
      return null
  })
}

Storage.prototype.getTopMessages = function (verb, limit) {
  return this.executeQuery(
    "SELECT message_hash, score FROM message_scores "
    + "WHERE verb = $1 ORDER BY score LIMIT $2"
    [verb, limit]).then(function (res) {
      return res.rows
    })
}


Storage.prototype.execute = function (fn) {
  return pg.connectAsync(this._url).spread(function (client, done) {
    return fn(client)
      .then(function (ret) {
        done()
        return ret
      }, function (err) {
        client.end()
        throw err
      })
  })
}

Storage.prototype.executeQuery = function (query, params) {
  return this.execute(function (client) {
    return client.queryAsync(query, params)
  })
}

Storage.prototype.executeQueries = function (queries, opts) {
  var concurrency = _.isObject(opts) ? opts.concurrency : 0

  var runNotify = this.executeTransaction.bind(this)
  if (_.has(opts, 'client')) {
    runNotify = function (fn) {
      return Promise.try(function () { return fn(opts.client) })
    }
  }

  return runNotify(function (client) {
    return Promise.map(queries, function (args) {
      return client.queryAsync.apply(client, args)
    }, {concurrency: concurrency})
  })
}

Storage.prototype.executeTransaction = function (fn) {
  return this.execute(function (client) {
    return client.queryAsync('BEGIN')
      .then(function () { return fn(client) })
      .then(function (ret) {
        return client.queryAsync('COMMIT').then(function () { return ret })

      }, function (err) {
        return client.queryAsync('ROLLBACK').then(function () { throw err })

      })
  })
}

module.exports = Storage