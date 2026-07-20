@echo off

echo ---------------------------------------------
echo        1/2 Pulling new code
echo ---------------------------------------------

git pull

echo ---------------------------------------------
echo        2/2 Updating and building services
echo ---------------------------------------------

docker compose up -d --build