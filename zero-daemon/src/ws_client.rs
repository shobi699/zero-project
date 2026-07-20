use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info};

use crate::protocol::{ServerMessage, StartMessage, StopMessage};

pub struct SttSession {
    write: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    read_handle: tokio::task::JoinHandle<()>,
}

impl SttSession {
    pub async fn connect(
        url: &str,
        result_tx: mpsc::UnboundedSender<SttEvent>,
    ) -> Result<Self> {
        let (ws_stream, _) = tokio_tungstenite::connect_async(url)
            .await
            .context("WebSocket connect failed")?;

        info!("connected to gateway: {}", url);

        let (mut write, read) = ws_stream.split();

        let start_msg = serde_json::to_string(&StartMessage::new())?;
        write.send(Message::Text(start_msg)).await?;

        let read_handle = tokio::spawn(async move {
            let mut read = read;
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        match serde_json::from_str::<ServerMessage>(&text) {
                            Ok(sm) => match sm.msg_type.as_str() {
                                "partial" => {
                                    let _ = result_tx.send(SttEvent::Partial(sm.text));
                                }
                                "final" => {
                                    let _ = result_tx.send(SttEvent::Final(sm.text));
                                    return;
                                }
                                "error" => {
                                    let _ =
                                        result_tx.send(SttEvent::Error(sm.message));
                                    return;
                                }
                                _ => {}
                            },
                            Err(e) => error!("invalid server message: {}", e),
                        }
                    }
                    Ok(Message::Close(_)) => {
                        let _ = result_tx
                            .send(SttEvent::Error("connection closed".into()));
                        return;
                    }
                    Err(e) => {
                        let _ = result_tx
                            .send(SttEvent::Error(format!("ws read error: {}", e)));
                        return;
                    }
                    _ => {}
                }
            }
        });

        Ok(Self { write, read_handle })
    }

    pub async fn send_audio(&mut self, pcm_bytes: Vec<u8>) -> Result<()> {
        self.write
            .send(Message::Binary(pcm_bytes))
            .await
            .context("sending audio chunk")
    }

    pub async fn end_speech(&mut self) -> Result<()> {
        let stop_msg = serde_json::to_string(&StopMessage::new())?;
        self.write
            .send(Message::Text(stop_msg))
            .await
            .context("sending stop")
    }

    pub async fn close(self) {
        let _ = self.read_handle.await;
    }
}

#[derive(Debug)]
pub enum SttEvent {
    #[allow(dead_code)]
    Partial(String),
    Final(String),
    Error(String),
}
