const litecore = require("litecore-explorers").litecore;
const Insight = require("litecore-explorers").Insight;
const request = require("request");
const cheerio = require('cheerio');
const crypto = require('crypto');

const insight = new Insight('https://explorer.rakonto.net/',"testnet");
const SERVICE_ADDRESS = 'mkFsWFamynBKCuesVDZpp3o2HBFwL6MhJk'; // address we send tx to
const SERVICE_DUST = 15000; // tiny amount right now
const OP_CHECKMULTISIG = 'ae';

class Rakonto
{
    constuctor()
    {
    }

    /**
     * Fetch a URL, find content section and inline images
    **/
    fetch_inlined(url, callback)
    {
        // 1. Load page
        // 2. Locate magic
        // 3. Grab parent element
        // 4. Itterate images and inline data
        request(url, async (err, resp, body) =>
        {
            if(err)
                return callback({error:'Error loading URL'});
            const $ = cheerio.load(body, { decodeEntities: false });
            const magic = $('#rakonto-magic');
            if(magic.length == 0)
                return callback({error:'Error finding content'});
            const content = magic.parent();
            const images = $('img', content);
            for(let img of images.get())
            {
                let src = $(img).attr('src');
                let data_src = '';
                try
                {
                    data_src = await this.get_data_ref(src);
                }
                catch(e)
                {
                    return callback({error:'Error loading image'});
                }
                $(img).attr('src', data_src);
            }
            let response_data = content.html().trim();
            callback(response_data);
        });
    }

    /**
     * Verify a given URL
    **/ 
    verify_url(url, callback)
    {
        // 1. Find most recent transaction for this URL
        // 2. Hash live content
        // 3. Compare hashs
        // 4. Check valid send address for most recent transaction
        //
        // Return an object with { hash_match:true|false, sender_match: true|false }

        let r = {hash_match: false, sender_match: false};
        const self = this;
        self.txs_for_url(url, Number.MAX_SAFE_INTEGER, (results) =>
        {
            if(results.error)
                return callback(results);
            if(results.length == 0)
                return callback({error:'No transactions found for URL'});
            let latest_tx = results[0];
            // Verify the hash...
            let hash = self.fromHex(latest_tx.vout[1].scriptPubKey.asm.split(' ')[1]);
            self.verify_hash(url, hash, (hash_eq) =>
            {
                if(hash_eq.error)
                    return callback(hash_eq);
                r.hash_match = hash_eq;
                // Validate sender...
                let matches = /(https?:\/\/[^\/]*)/.exec(url);
                if (matches.length < 2)
                    return callback({error:'Cannot extract domain'});
                const rkta_url = matches[1] + '/rkta.txt';
                request(rkta_url, (err, resp, body) => 
                {
                    if(err || resp.statusCode !== 200)
                        return callback({error:"Error loading " + rkta_url});
                    const site_addrs = body.split(',');
                    const tx_send_addr = latest_tx.vin[0].addr;
                    r.sender_match = site_addrs.find(e => e == tx_send_addr) != undefined;
                    callback(r);
                });
            });
        });
    }

    /**
     * Sed a transaction
    **/ 
    send_tx(from, privkey, hash, url, callback)
    {
        const mso = this.url_to_multisig(url);
        const signkey = new litecore.PrivateKey(privkey, 'testnet');
        insight.getUtxos(from, (err, utxos) =>
        {
            if(err)
            {
                return callback({error: err});
            }
            const tx = new litecore.Transaction()
                .from(utxos)
                .to(SERVICE_ADDRESS, SERVICE_DUST)
                .addData(hash)
                .addOutput(mso)
                .change(from)
                .sign(signkey);
            insight.broadcast(tx, (error, txid) =>
            {
                if (error)
                {
                    return callback({error: error});
                }
                return callback(txid);
            });
        });
    }

    /**
     * Return the URL for a given txid
    **/ 
    url_from_tx(txid, callback)
    {
        insight.getTransaction(txid, (err, tx) => 
        {
            if(err)
            {
                return callback({error: err});
            }
            const mso = tx.vout.find(o => o.scriptPubKey.hex.substr(-2) == OP_CHECKMULTISIG);
            if(!mso)
            {
                return callback({error: "No MultiSig output"});
            }
            return callback(this.url_from_script(mso.scriptPubKey.hex));
        });
    }

    /**
     * Return up to 10 transactions for a given `url`.
     * Optional parameter `older_than` to load trnsaction older than time (allows paging).
    **/ 
    txs_for_url(url, older_than, callback)
    {
        older_than = older_than || Number.MAX_SAFE_INTEGER;
        const page_size = 10;
        const insight_max = 50; // maximum txs from insight per page
        let bail = 10; // bail at 500 txs; client can always call again with older_than 
        let results = [];

        // 1. get domain send address(s)
        // 2. get txs for that send address
        // 3. filter to txs with multisig
        // 4. filter to url
        // 5. load more if needed and can
        const matches = /(https?:\/\/[^\/]*)/.exec(url);
        if (matches.length < 2)
        {
            return callback({error:"Bad URL"});
        }
        const rkta_url = matches[1] + '/rkta.txt';
        const self = this;
        request(
        {
            method: 'GET',
            url: rkta_url
        },
        (err, resp, body) => 
        {
            if(err || resp.statusCode !== 200)
            {
                return callback({error:"Error loading " + rkta_url});
            }
            const send_addrs = body;

            function loadNext(from)
            {
                bail--;
                const to = from + insight_max;
                insight.requestGet('/api/addrs/' + send_addrs + '/txs?from=' + from + '&to=' + to, (err, resp, body) =>
                {
                    if(err || resp.statusCode !== 200)
                    {
                        return callback({error:"Error loading " + rkta_url});
                    }
                    let jo = JSON.parse(body);
                    let txs = jo.items;
                    txs = txs.filter(tx => tx.vout.find(o => o.scriptPubKey.hex.substr(-2) == OP_CHECKMULTISIG));
                    txs = txs.filter(tx => tx.time < older_than);
                    txs = txs.filter(tx => 
                    {
                        let mso = tx.vout.find(o => o.scriptPubKey.hex.substr(-2) == OP_CHECKMULTISIG);
                        let mso_url = self.url_from_script(mso.scriptPubKey.hex);
                        return mso_url == url;
                    });
                    results = results.concat(txs.slice(0, page_size - results.length));
                    if(jo.to === jo.totalItems || results.length === page_size || bail === 0)
                    {
                        // Either have 10 results or reached max txs so done...
                        return callback(results);
                    }
                    else
                    {
                        // Recursively load next batch of transactions to search...
                        loadNext(to);
                    }
                });
            }

            // Kick off...
            loadNext(0);
        });
    }

    // private methods //

    url_to_multisig(url)
    {
        const b = Buffer.from(url);
        const script = new litecore.Script();
        script.add(litecore.Opcode.smallInt(1));
        let ha = [];
        const prefix = new Buffer([0x04]);
        for(let i=0; i<b.length; i+=64) 
        {
            let buf = Buffer.concat([prefix, b.slice(i, i+64)]);
            if(buf.length < 65)
            {
                let pad = Buffer.alloc(65 - buf.length);
                buf = Buffer.concat([buf, pad]);
            }
            ha.push(buf.toString('hex'));
            script.add(buf);
        }
        script.add(litecore.Opcode.smallInt(ha.length));
        script.add(litecore.Opcode.OP_CHECKMULTISIG);
        return new litecore.Transaction.Output({script:script, satoshis:1000});
    }

    url_from_script(script)
    {
        script = new litecore.Script(script); // ensure script is a script object
        let sba = script.chunks.filter(c => c.buf).map(b => b.buf);
        sba = sba.map(b => b.slice(1).toString('ascii'));
        return sba.join('').replace(/[^ -~]+/g, "");
    }

    async get_data_ref(src)
    {
        return new Promise((resolve, reject) =>
        {
            const req = require('request').defaults({ encoding: null });
            req.get(src, (error, response, body) =>
            {
                if (!error && response.statusCode == 200)
                {
                    let data = "data:" + response.headers["content-type"] + ";base64," + new Buffer(body).toString('base64');
                    resolve(data);
                }
                else
                    reject(error);
            });
        });
    }

    verify_hash(url, hash, callback)
    {
        const hasher = crypto.createHash('sha1');
        this.fetch_inlined(url, (body) =>
        {
            if(body.error)
                return callback(body);
            let to_hash = body;
            hasher.update(to_hash);
            const live_hash = hasher.digest('hex');
            callback(live_hash == hash);
        });
    }

    fromHex(h) {
        let s = '';
        for (let i = 0; i < h.length; i += 2) {
            s += String.fromCharCode(parseInt(h.substr(i, 2), 16));
        }
        if (!/[a-zA-Z0-9]{40}/.test(s)) {
            return '';
        }
        return s;
    }
}

module.exports = Rakonto;

