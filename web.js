var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var Storage = require('./storage')
var core = require('./core')
var Promise = require('bluebird')
var BalanceMonitor = require('./balmon')
var config = require('./config')
var _ = require('lodash')

var storage = new Storage({url: config.postgres_url})

app.set('view engine', 'jade');
app.use(bodyParser.urlencoded({extended: false}));

var balmon = new BalanceMonitor(storage, core.connector)
balmon.init()

function perhapsProcessAddress(address) {
  balmon.updateAddressBalance(address, true)
}

function errorHandler(res) {
  return (function (err) {
      console.log(err.stack || err)
      res.status(500).send(err.toString())
  })
}

function formatMessage(hash, score, message) {
  if (score) {
    score = (parseInt(score) / 100000000).toString()
  }
  return {
    text: JSON.parse(message).text, 
    score: score || "0",
    hash: hash,
    details_link: '/message_details?hash=' + hash,
    support_link: '/submit_signature?hash=' + hash
  }   
}

app.get('/', function (req, res) {
  var topMessages = storage.getTopMessages('support', 25)
  .reduce(function (messages, message_score) {
    return storage.getMessageByHash(message_score.message_hash).then(function (message) {
      console.log(messages)
      messages.push(formatMessage(message_score.message_hash,
                                  message_score.score,
                                  message))
      return messages
    })
  }, [])
  var newMessages = storage.getNewMessages().map(function (msg) {
    return formatMessage(msg.hash, "0", msg.message)
  })

  Promise.join(topMessages, newMessages,
    function (topMessages, newMessages) {
      return topMessages.concat(newMessages)
    })
  .then(function (messages) {
      res.render('index', {
        messages: messages
      })
    }, errorHandler(res)
  )
})

app.get('/message_details', function (req, res) {
  var hash = req.query.hash
  if (!hash) return res.redirect('/')
  Promise.all([storage.getMessageByHash(hash),
               storage.getVotes(hash, 'support')])
  .then(
      function (data) {
        var message = data[0]
        var votes = data[1]
        var score = _.sum(_.pluck(votes, 'balance'))
        res.render('message_details', {
            message: formatMessage(hash, score, message),
            votes: votes
        })
      }, 
      errorHandler(res)
  )
})

app.get('/show_message', function (req, res) {
    var message = ''
    if (req.query.message == 'sigadd') {
      message = "A signature is added. Data will be updated shortly."
    }        
    res.render('show_message', { message: message })   
})

app.get('/submit_message', function (req, res) { res.render('submit_message') })
app.post('/submit_message', function (req, res) {
  var text = req.body.text
  if (text && /\S/.test(text)) {
    // got some non-empty text
    var messageObj = {type: 'text', text: text}
    var message = JSON.stringify(messageObj)
    var hash = core.computeMessageHash(message)
    storage.getMessageByHash(hash).then(function (existing_message) {
      if (existing_message !== null)
        return false
      else 
        return storage.insertMessage(message, hash).then(function () {
          return true
        })
    })
    .then(
      function (added) {
        var url = '/submit_signature?hash=' + hash
        if (added) url += "&added=1"
        res.redirect(303, url)    
      },  errorHandler(res)
    )
  } else {
    // it's all empty, show the form again
    res.render('submit_message') 
  }    
})

app.get('/submit_signature', function (req, res) {
  if (!req.query.hash)
    res.redirect('/')
  else
     res.render('submit_signature', {
       hash: req.query.hash,
       statement: core.computeStatement(req.query.hash, 'support'),
       was_added: req.query.added
     })
})
app.post('/submit_signature', function (req, res) {
  var signature = req.body.signature,
      hash = req.body.hash,
      address = req.body.address
  if (core.verifySignature(address, signature, core.computeStatement(hash, 'support'))) {
    storage.insertSignature(address, 'support', signature, hash).then(
      function () {
        perhapsProcessAddress(address)
        res.redirect(303, "/show_message?message=sigadd")
      }, errorHandler(res)
    )
  } else {
     res.render('submit_signature', {
       hash: req.query.hash,
       statement: core.computeStatement(req.query.hash, 'support'),
       error: true
     })
  }
})

var server = app.listen(config.port, function () {
  console.log('listening on ' + config.port);
});


