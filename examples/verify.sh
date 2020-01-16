#!/bin/bash

if [[ $# -ne 2 ]]; then
    echo
    echo "Usage: verify.sh <url> <hash>"
    exit -1
fi

echo
echo "Checking: $1"

# Get the parent content of our magic tag...
CONTENT=`curl -Ls "$1" | xmllint --html -xpath '//div[@id="rakonto-magic"]/../child::node()' - 2> /dev/null`
#echo "$CONTENT"

# Embed the image data...
IMAGES=`echo "$CONTENT" | xmllint --html -xpath '//img/@src' - 2> /dev/null` 
for I in $IMAGES; do
    URL=`echo $I | sed 's#src=["'\'']\(.*\)["'\'']#\1#'`
    echo "Inlining: $URL"
    MIME=`curl -skIL $URL | grep '^Content-Type' | tail -n 1 | awk -F' ' '{print $2}' | tr -d '\r\n'`
    BASE=`curl -skL $URL | base64`
    URL_ESC=$(sed 's/[\*\.]/\\&/g' <<<"$URL")
    CONTENT=`echo -n "$CONTENT" | sed 's#src="'$URL_ESC'"#src="data:'$MIME';base64,'$BASE'"#g'` 
done

# Close img tags as thats how wordpress does...
CONTENT=`echo -n "$CONTENT" | sed 's#<img \([^>]*\)>#<img \1 />#g'` 

# Remove leading junk if any...
RE='^[ '$'\n'$'\r'$'\t'']*'
[[ "$CONTENT" =~ $RE ]] && LEN=${#BASH_REMATCH} && CONTENT="${CONTENT:$LEN}"

# Remove trailing junk if any...
RE='[ '$'\n'$'\r'$'\t'']*$'
[[ "$CONTENT" =~ $RE ]] && CONTENT="${CONTENT%%$BASH_REMATCH}"

#echo "$CONTENT"

# Get sha1 hash...
HASH=`echo "$CONTENT" | shasum | awk '{print $1}'`

# Compare...

if [[ $2 == $HASH ]]; then
    echo "Verified: $1 $2 == $HASH"
    exit 0
else
    echo "Unverified: $1 $2 <> $HASH"
    exit -2
fi
