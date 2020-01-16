const Rakonto = require('./rakonto-utils');
const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const apicache = require('apicache');
const app = express();
const rakonto = new Rakonto();


app.use((req, res, next) =>
{
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(bodyParser.urlencoded({ extended: true }));

let cache = apicache.options(
    {
        appendKey: (req, res) =>
        {
          // hash the request body as the key for the POST endpoint
          return req.method + crypto.createHash('sha256').update(JSON.stringify(req.body), 'utf8').digest("hex");
        }
    }
).middleware;
app.use(cache('15 seconds'));

app.post('/verify_url', (req, res, next) =>
{
    let url = req.body.url;
    if(!validURL(url))
    {
        res.status(400).send("Invalid URL");
        return;
    }

    rakonto.verify_url(url, (r) =>
    {
        if(r.error)
        {
            res.status(400).json(r);
            return;
        }
        res.json(r);
    });
});

app.post('/fetch_inlined', (req, res, next) =>
{
    let url = req.body.url;
    if(!validURL(url))
    {
        res.status(400).send("Invalid URL");
        return;
    }
    rakonto.fetch_inlined(url, (r) =>
    {
        if(r.error)
        {
            res.status(400).json(r);
            return;
        }
        res.type('text/html');
        res.send(r);
    });
});

app.post('/get_data', (req, res, next) =>
{
    let url = req.body.url;
    if(!validURL(url))
    {
        res.status(400).send("Invalid URL");
        return;
    }
    request.get({url: url, encoding:null}, (error, response, body) =>
    {
        if(error)
        {
            res.status(400).send(error);
            return;
        }
        let enc = /image\//.test(response.headers['content-type']) ? 'base64' : 'utf8';
        res.type('text/plain');
        res.send(body.toString(enc));
    });
});

app.post('/send_tx', (req, res, next) =>
{
    let from = req.body.from;
    let privkey = req.body.privkey;
    let hash = req.body.hash;
    let url = req.body.url;

    if(!/^[0-9a-zA-Z]{26,35}$/.test(from))
    {
        res.status(400).send("Invalid from address");
        return;
    }
    if(!/^[0-9a-zA-Z]{52}$/.test(privkey))
    {
        res.status(400).send("Invalid private key");
        return;
    }
    if(!/^[0-9a-zA-Z]{40}$/.test(hash))
    {
        res.status(400).send("Invalid hash");
        return;
    }
    if(!validURL(url))
    {
        res.status(400).send("Invalid URL");
        return;
    }

    rakonto.send_tx(from, privkey, hash, url, (r) =>
    {
        if(r.error)
        {
            res.status(400).json(r);
            return;
        }
        res.json(r);
    });
});

app.post('/txs_for_url', (req, res, next) =>
{
    let url = req.body.url;
    let older_than = req.body.older_than;

    if(!validURL(url))
    {
        res.status(400).send("Invalid URL");
        return;
    }
    if(older_than != undefined && !/^[0-9]+$/.test(older_than))
    {
        res.status(400).send("Invalid older_than");
        return;
    }

    rakonto.txs_for_url(url, older_than, (r) =>
    {
        if(r.error)
        {
            res.status(400).json(r);
            return;
        }
        res.json(r);
    });
});

app.post('/url_from_tx', (req, res, next) =>
{
    let txid = req.body.txid;

    if(!/^[0-9a-fA-F]{64}$/.test(txid))
    {
        res.status(400).send("Invalid txid");
        return;
    }

    rakonto.url_from_tx(txid, (r) =>
    {
        if(r.error)
        {
            res.status(400).json(r);
            return;
        }
        res.json({txid: txid, url: r});
    });
});

function validURL(url)
{
    return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(url);
}

app.listen(3000, () => console.log('Example app listening on port 3000!'));
