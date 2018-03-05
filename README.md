# Rakonto Tools

## Back-end server

This is the back-end code used by rakonto.net. It consists of 2 parts:

1. `rakonto-express.js`
> The Express server.
2. `rakonto-utils.js`
> The utility functions used by both the plugin and explorer.

It is worth noting that a publisher can self-host all of the Rakonto components. The only important things that should not be changed are the service address, which is used to find all Rakonto transactions on the blockchain and the transaction format, which requires both an `OP_RETURN` (used to store the content hash) and a multisig output (used to encode the URL). 

If a publisher wishes to self-host everything, they will need to perform several steps:

- Run a litecoin node and edit all URLs using a node to point to your nodes host.
- Edit the Rakonto plugin source by editing the URL to where this back-end code will be accessible.
- Optionally, edit the network (testnet / mainnet) in all components. Currently Rakonto is set to use the testnet while in this early stage of development.

## Example Tools

Currently there are 2 examples of how to verify whether the current current content matches a given hash (from a transaction).

1. `verify.sh`
2. `rakonto-verify.js`

These scripts are just examples and serve as a guide only. For a more complete implementation, see `src/lib/verify.js` in the Rakonto Explorer repository. That takes the extra steps to verify whether a transaction is from a valid publisher wallet address, checks whether the transaction is the most recent for the given URL and of course checks the hash of the live content against the transactions content hash.

There is also an example tool, `rakonto-cli`, should you need to perform back-end tasks without actually running the Express erver above.
