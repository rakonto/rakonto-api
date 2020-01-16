#!/usr/bin/env node

const request = require('request');
const cheerio = require('cheerio');
const crypto = require('crypto');

const hasher = crypto.createHash('sha1');
const args = process.argv.slice(2);

function usage()
{
    console.log(`Usage:\n\trakonto-verify <url> <hash>`);
    process.exit(-1);
}

async function get_data_ref(src)
{
    return new Promise((resolve, reject) =>
    {
        let req = require('request').defaults({ encoding: null });
        req.get(src, (error, response, body) =>
        {
            if (!error && response.statusCode == 200)
            {
                data = "data:" + response.headers["content-type"] + ";base64," + new Buffer(body).toString('base64');
                resolve(data);
            }
            else
                reject(error);
        });
    });
}

function verify(url, hash)
{
    // 1. Load page
    // 2. Locate magic
    // 3. Grab parent element
    // 4. Itterate images and inline data
    // 5. Hash
    // 6. Compare
    console.log(`\nChecking: ${url}`);
    request(url, async (err, resp, body) =>
    {
        let $ = cheerio.load(body, { decodeEntities: false });
        let magic = $('#rakonto-magic');
        if(magic.length == 0)
        {
            console.log('Error: cannot find content');
            return;
        }
        let content = magic.parent();
        let images = $('img', content);
        for(img of images.get())
        {
            let src = $(img).attr('src');
            console.log(`Inlining: ${src}`);
            let data_src = await get_data_ref(src);
            $(img).attr('src', data_src);
        }
        let to_hash = content.html().trim();
        // Close image tags and add newline (cheerio messes the img tags and wordpress adds newline)...
        to_hash = to_hash.replace(/<img ([^>]*)>/g, "<img $1 />");
        hasher.update(to_hash);
        let live_hash = hasher.digest('hex');
        if(live_hash == hash)
        {
            console.log(`Verified: ${url} ${hash} == ${live_hash}`);
            process.exit(0);
        }
        else
        {
            console.log(`Unverified: ${url} ${hash} <> ${live_hash}`);
            process.exit(-2);
        }
    });
}

if(args.length != 2)
{
    usage();
}

verify(args[0], args[1]);

