FROM python:3.13-slim
WORKDIR /app
RUN groupadd --gid 10001 gwg && useradd --uid 10001 --gid gwg --no-create-home gwg \
    && mkdir /data && chown gwg:gwg /data
COPY --chown=gwg:gwg www/ /app/www/
COPY --chown=gwg:gwg hosting/server.py /app/hosting/server.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 GWG_WEB_ROOT=/app/www GWG_DATA_DIR=/data GWG_BIND=0.0.0.0 GWG_PORT=8080
USER gwg
EXPOSE 8080
CMD ["python3", "/app/hosting/server.py"]
