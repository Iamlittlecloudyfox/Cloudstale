# ☁️ Cloudstale

A lightweight desktop client for [Ollama](https://ollama.com/) and custom LLM APIs.

Built with React. Supports local and remote models through Ollama, OpenAI-compatible APIs, Anthropic, and OpenRouter.

## Table of Contents

* [Why Cloudstale?](#why-cloudstale)
* [Screenshots](#screenshots)
* [Features](#features)
* [Known Supported APIs](#known-supported-apis)
* [Tech Stack](#tech-stack)
* [Installation](#installation)
* [Configuration](#configuration)
* [License](#license)

## Why Cloudstale?

Cloudstale started as a small personal project built around two simple ideas:

> `Using LLMs should not require a complicated interface.`
> `Why can't an app have an immersive mascot?`

The goal is to provide a lightweight client that makes it easy to work with local and remote models without tying the user to a single provider. Ollama can be used for local models, while custom API support allows connecting to OpenAI-compatible services, Anthropic, OpenRouter, and other providers.

It is intentionally simple. There are no unnecessary features or complex setup — just a clean interface for talking to the models you want to use.

## Screenshots

<img width="1920" height="1030" alt="{EE53C0FA-3FB5-4C36-8656-9AD76F6C92D8}" src="https://github.com/user-attachments/assets/0e322bca-5292-4eda-ac0e-3458cbf11a0b" />

<img width="1920" height="1031" alt="{0EE7D6F2-0B3F-4FF0-A7BA-1872B18F8F22}" src="https://github.com/user-attachments/assets/99b3b807-b162-452a-8f8a-8468163e4496" />

<img width="1920" height="1031" alt="{9BFF2063-E530-418A-8C33-AC75675DB2A3}" src="https://github.com/user-attachments/assets/eaebd56d-1106-4eb6-8c3a-634fac80feef" />

## Features

* Simple interface for chatting with LLMs
* Ollama API support
* Custom API support
* Local and remote models
* Lightweight desktop application
* Automatic updates (can be disabled)

## Known Supported APIs

| Provider          | Support |
| ----------------- | ------- |
| Ollama            | Yes     |
| OpenAI-compatible | Yes     |
| Anthropic         | Yes     |
| OpenRouter        | Yes     |
| DeepSeek          | Yes     |

## Tech Stack

* React
* TypeScript
* Tailwind CSS
* Tauri
* Rust

## Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/Iamlittlecloudyfox/Cloudstale.git
cd Cloudstale
npm install
```

Run the development version:

```bash
npm run dev
```

To run the Tauri application:

```bash
npx tauri dev
```

> [!WARNING]
> **Development build**
>
> The development Tauri build currently has some known issues with API requests. The application works correctly in the release build.
>
> The cause of this issue has not been investigated yet.

## Configuration

API providers can be configured from the application settings.

For Ollama, specify the address of your local or remote Ollama instance.

Example:

```text
http://localhost:11434
```

Remote Ollama instances can also be used if they are accessible from your machine.

Custom API providers can be configured with their corresponding API endpoint and authentication settings.

## License

The source code is licensed under the MIT License.

The project also includes [`NOTICE.md`](NOTICE.md), which contains additional terms regarding the project's branding, mascot, and other assets.

The MIT License applies to the source code only. Additional project assets and branding are subject to the terms specified in `NOTICE.md`.
