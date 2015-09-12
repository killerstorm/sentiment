var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var Storage = require('./storage')
var core = require('./core')

var storage = new Storage({url: "postgres://alex:dddd@localhost:5432/sentiment"})

app.set('view engine', 'jade');
app.use(bodyParser.urlencoded({extended: false}));

function perhapsProcessAddress(address) {
  // update address balance
  return core.computeAddressBalance(address).then(function (balance) {
    return storage.updateAddressBalance(address, balance)
  })
}

function errorHandler(res) {
  return (function (err) {
      console.log(err.stack || err)
      res.status(500).send(err.toString())
  })
}

app.get('/', function (req, res) {  
  storage.getTopMessages('support', 25).then(function (res) {
    console.log(res)
    return res
  }).map(function (message_score) {
    return storage.getMessageByHash(message_score.message_hash).then(function (message) {
      var hash = message_score.message_hash
      return {
        text: JSON.parse(message).text, 
        score: message_score.score || "0",
        hash: hash,
        support_link: '/submit_signature?hash=' + hash
      }
    })
  }).then(
    function (messages) {
      res.render('index', {
        messages: messages, 
        signature_added: req.query.signature_added
      })
    }, errorHandler(res)
  )
})

app.get('/show_message', function (req, res) {
    res.render('show_message', { message: req.query.message })   
})

app.get('/submit_message', function (req, res) { res.render('submit_message') })
app.post('/submit_message', function (req, res) {
  var text = req.body.text
  if (text && /\S/.test(text)) {
    // got some non-empty text
    var messageObj = {type: 'text', text: text}
    var message = JSON.stringify(messageObj)
    var hash = core.computeMessageHash(message)
    storage.getMessageByHash(hash).then(function (message) {
                                          
    })
    storage.insertMessage(message, hash).then(
      function () {
        res.redirect(303, '/submit_signature?hash=' + hash + "&added=1")    
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
        res.redirect(303, "/show_message?message=signature%20added")
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

var server = app.listen(2222, function () {
  console.log('listening on 2222');
});


