use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct StartMessage {
    #[serde(rename = "type")]
    pub msg_type: &'static str,
    pub config: AudioConfig,
}

#[derive(Serialize)]
pub struct AudioConfig {
    pub sample_rate: u32,
    pub channels: u16,
    pub language: &'static str,
}

#[derive(Serialize)]
pub struct StopMessage {
    #[serde(rename = "type")]
    pub msg_type: &'static str,
}

#[derive(Deserialize, Debug)]
pub struct ServerMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub message: String,
}

impl StartMessage {
    pub fn new() -> Self {
        Self {
            msg_type: "start",
            config: AudioConfig {
                sample_rate: 16000,
                channels: 1,
                language: "fa",
            },
        }
    }
}

impl StopMessage {
    pub fn new() -> Self {
        Self { msg_type: "stop" }
    }
}
