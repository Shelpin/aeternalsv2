
# 🚀 ElizaOS Multi-Agent Management System

A comprehensive toolkit for managing, monitoring, and securing multiple Telegram bot agents in your ElizaOS environment.

![Agent Management System](https://img.shields.io/badge/Agent%20Management-System-blue)
![Security Enhanced](https://img.shields.io/badge/Security-Enhanced-green)
![Real-time Monitoring](https://img.shields.io/badge/Monitoring-Real--time-orange)

##  System Overview

The ElizaOS Multi-Agent Management System provides a robust set of scripts for handling the complete lifecycle of your ElizaOS Telegram agents:

- **Starting Agents**: Secure launching with consistent port assignment
- **Stopping Agents**: Clean termination with proper resource cleanup
- **Monitoring**: Real-time activity tracking and health checks
- **Security**: Enhanced protection for tokens and system resources

This system is designed for users who need to manage multiple agents simultaneously with consistent behavior, high security, and comprehensive monitoring capabilities.

## 📋 Components

The management system consists of three core scripts:

1. **start_agents.sh** - Launches agents with secure session management
2. **stop_agents.sh** - Terminates agents and cleans up resources
3. **monitor_agents.sh** - Provides real-time monitoring and health checks

## 🔧 Technical Features

### Start System (`start_agents.sh`)

- **Session Isolation**: Uses `setsid` to create independent process groups
- **Consistent Port Assignment**: Three-tier port allocation system
  - Reuses previous port assignments when available
  - Falls back to position-based port allocation (agent's position in array + starting port)
  - Dynamically finds available ports if needed
- **Token Security**: Masks sensitive tokens and properly handles environment variables
- **Process Management**: Better PID tracking with proper child process handling
- **Permissions Management**: Applies secure file permissions

```bash
# Start all agents
./start_agents.sh

# Start specific agents
./start_agents.sh bitcoin_maxi_420 eth_memelord_9000

# Start with enhanced security measures
./start_agents.sh -s
```

### Stop System (`stop_agents.sh`)

- **Process Tree Termination**: Properly terminates all child processes
- **Graceful Shutdown**: Attempts clean shutdown before force killing
- **Resource Cleanup**: Removes port files and PID files
- **Port Cleanup Mode**: Special mode to free all used ports
- **Enhanced Security**: Input validation and secure command execution

```bash
# Stop all agents
./stop_agents.sh

# Force stop all agents
./stop_agents.sh -f

# Stop specific agents
./stop_agents.sh bitcoin_maxi_420

# Cleanup only ports without stopping agents
./stop_agents.sh -p

# Run with extra security checks
./stop_agents.sh -s
```

### Monitoring System (`monitor_agents.sh`)

- **Real-time Log Display**: View activity across all agents simultaneously
- **Agent Status Checks**: Comprehensive health monitoring
- **Port Usage Verification**: Multi-method port detection
- **Security Auditing**: Permissions and exposure checks
- **Resource Usage Statistics**: Memory, CPU, and runtime tracking

```bash
# Check status of all agents
./monitor_agents.sh

# Monitor logs in real-time for all agents
./monitor_agents.sh -w

# Monitor only activity logs for a specific agent
./monitor_agents.sh -w -a bitcoin_maxi_420

# View error logs for all agents
./monitor_agents.sh -l -e

# Check system status
./monitor_agents.sh -s

# Perform security audit
./monitor_agents.sh -S
```

## 🔒 Security Features

The management system includes extensive security enhancements:

- **Secure Process Isolation**: Prevents signal propagation between processes
- **Input Validation**: Prevents command injection and script exploitation
- **Token Protection**: Masks sensitive information and secures environment variables
- **Permission Management**: Applies and verifies proper file permissions
- **Audit Capabilities**: Security scanning for potential vulnerabilities
- **Process Verification**: Ensures processes are properly running and using expected resources

## 📊 Monitoring Capabilities

The monitoring system provides comprehensive visibility:

- **Real-time Activity**: View incoming/outgoing messages as they happen
- **Agent Health**: Check uptime, resource usage, and connectivity
- **Port Management**: Verify port assignments and detect conflicts
- **Log Analysis**: Filter logs by activity type or errors
- **Resource Tracking**: Monitor memory usage, CPU, and runtime statistics

## 📈 Resource Management

The system optimizes resource usage:

- **Process Tracking**: Properly manages PID files and process trees
- **Port Management**: Ensures consistent port assignment
- **Memory Usage**: Tracks and reports memory consumption
- **CPU Utilization**: Monitors agent CPU usage
- **State Preservation**: Maintains consistent state across restarts

## 🚦 Getting Started

1. Ensure you have the required dependencies:
   - Bash 4.0+
   - lsof (for port management)
   - standard Unix tools

2. Set up your agent configuration in the scripts:
   - Define agents in the `AGENTS` array
   - Configure port ranges and directories

3. Make the scripts executable:
   ```bash
   chmod +x start_agents.sh stop_agents.sh monitor_agents.sh
   ```

4. Start your agents:
   ```bash
   ./start_agents.sh
   ```

5. Monitor their status:
   ```bash
   ./monitor_agents.sh
   ```

## 🔍 Troubleshooting

| Problem | Solution |
|---------|----------|
| Agent fails to start | Check logs with `./monitor_agents.sh -l` |
| Port conflicts | Run `./stop_agents.sh -p` to clean up ports |
| Security warnings | Address issues found with `./monitor_agents.sh -S` |
| Agent unresponsive | Restart with `./stop_agents.sh && ./start_agents.sh` |
| Permission errors | Ensure proper permissions on `.env` and log directories |

Based on the ELizaOS framwework 

# Eliza 🤖

<div align="center">
  <img src="./docs/static/img/eliza_banner.jpg" alt="Eliza Banner" width="100%" />
</div>

<div align="center">

📑 [Technical Report](https://arxiv.org/pdf/2501.06781) |  📖 [Documentation](https://elizaos.github.io/eliza/) | 🎯 [Examples](https://github.com/thejoven/awesome-eliza)

</div>


## 📖 README Translations

[中文说明](i18n/readme/README_CN.md) | [日本語の説明](i18n/readme/README_JA.md) | [한국어 설명](i18n/readme/README_KOR.md) | [Persian](i18n/readme/README_FA.md) | [Français](i18n/readme/README_FR.md) | [Português](i18n/readme/README_PTBR.md) | [Türkçe](i18n/readme/README_TR.md) | [Русский](i18n/readme/README_RU.md) | [Español](i18n/readme/README_ES.md) | [Italiano](i18n/readme/README_IT.md) | [ไทย](i18n/readme/README_TH.md) | [Deutsch](i18n/readme/README_DE.md) | [Tiếng Việt](i18n/readme/README_VI.md) | [עִברִית](i18n/readme/README_HE.md) | [Tagalog](i18n/readme/README_TG.md) | [Polski](i18n/readme/README_PL.md) | [Arabic](i18n/readme/README_AR.md) | [Hungarian](i18n/readme/README_HU.md) | [Srpski](i18n/readme/README_RS.md) | [Română](i18n/readme/README_RO.md) | [Nederlands](i18n/readme/README_NL.md) | [Ελληνικά](i18n/readme/README_GR.md)

## 🚩 Overview

<div align="center">
  <img src="./docs/static/img/eliza_diagram.png" alt="Eliza Diagram" width="100%" />
</div>

## ✨ Features

- 🛠️ Full-featured Discord, X (Twitter) and Telegram connectors
- 🔗 Support for every model (Llama, Grok, OpenAI, Anthropic, Gemini, etc.)
- 👥 Multi-agent and room support
- 📚 Easily ingest and interact with your documents
- 💾 Retrievable memory and document store
- 🚀 Highly extensible - create your own actions and clients
- 📦 Just works!

## Video Tutorials

[AI Agent Dev School](https://www.youtube.com/watch?v=ArptLpQiKfI&list=PLx5pnFXdPTRzWla0RaOxALTSTnVq53fKL)

## 🎯 Use Cases

- 🤖 Chatbots
- 🕵️ Autonomous Agents
- 📈 Business Process Handling
- 🎮 Video Game NPCs
- 🧠 Trading

## 🚀 Quick Start

### Prerequisites

- [Python 2.7+](https://www.python.org/downloads/)
- [Node.js 23+](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [pnpm](https://pnpm.io/installation)

> **Note for Windows Users:** [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install-manual) is required.

### Use the Starter (Recommended for Agent Creation)

Full steps and documentation can be found in the [Eliza Starter Repository](https://github.com/elizaOS/eliza-starter).
```bash
git clone https://github.com/elizaos/eliza-starter.git
cd eliza-starter
cp .env.example .env
pnpm i && pnpm build && pnpm start
```

### Manually Start Eliza (Only recommended for plugin or platform development)

#### Checkout the latest release

```bash
# Clone the repository
git clone https://github.com/elizaos/eliza.git

# This project iterates fast, so we recommend checking out the latest release
git checkout $(git describe --tags --abbrev=0)
# If the above doesn't checkout the latest release, this should work:
# git checkout $(git describe --tags `git rev-list --tags --max-count=1`)
```

If you would like the sample character files too, then run this:
```bash
# Download characters submodule from the character repos
git submodule update --init
```

#### Edit the .env file

Copy .env.example to .env and fill in the appropriate values.

```
cp .env.example .env
```

Note: .env is optional. If you're planning to run multiple distinct agents, you can pass secrets through the character JSON

#### Start Eliza

```bash
pnpm i
pnpm build
pnpm start

# The project iterates fast, sometimes you need to clean the project if you are coming back to the project
pnpm clean
```

### Interact via Browser

Once the agent is running, you should see the message to run "pnpm start:client" at the end.

Open another terminal, move to the same directory, run the command below, then follow the URL to chat with your agent.

```bash
pnpm start:client
```

Then read the [Documentation](https://elizaos.github.io/eliza/) to learn how to customize your Eliza.

---

### Automatically Start Eliza

The start script provides an automated way to set up and run Eliza:

```bash
sh scripts/start.sh
```

For detailed instructions on using the start script, including character management and troubleshooting, see our [Start Script Guide](./docs/docs/guides/start-script.md).

> **Note**: The start script handles all dependencies, environment setup, and character management automatically.

---

### Modify Character

1. Open `packages/core/src/defaultCharacter.ts` to modify the default character. Uncomment and edit.

2. To load custom characters:
    - Use `pnpm start --characters="path/to/your/character.json"`
    - Multiple character files can be loaded simultaneously
3. Connect with X (Twitter)
    - change `"clients": []` to `"clients": ["twitter"]` in the character file to connect with X

---

### Add more plugins

1. run `npx elizaos plugins list` to get a list of available plugins or visit https://elizaos.github.io/registry/

2. run `npx elizaos plugins add @elizaos-plugins/plugin-NAME` to install the plugin into your instance

#### Additional Requirements

You may need to install Sharp. If you see an error when starting up, try installing it with the following command:

```
pnpm install --include=optional sharp
```

---

## Using Your Custom Plugins
Plugins that are not in the official registry for ElizaOS can be used as well. Here's how:

### Installation

1. Upload the custom plugin to the packages folder:

```
packages/
├─plugin-example/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts        # Main plugin entry
│   ├── actions/        # Custom actions
│   ├── providers/      # Data providers
│   ├── types.ts        # Type definitions
│   └── environment.ts  # Configuration
├── README.md
└── LICENSE
```

2. Add the custom plugin to your project's dependencies in the agent's package.json:

```json
{
  "dependencies": {
    "@elizaos/plugin-example": "workspace:*"
  }
}
```

3. Import the custom plugin to your agent's character.json

```json
  "plugins": [
    "@elizaos/plugin-example",
  ],
```

---

### Start Eliza with Gitpod

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/elizaos/eliza/tree/main)

---

### Deploy Eliza in one click

Use [Fleek](https://fleek.xyz/eliza/) to deploy Eliza in one click. This opens Eliza to non-developers and provides the following options to build your agent:
1. Start with a template
2. Build characterfile from scratch
3. Upload pre-made characterfile

Click [here](https://fleek.xyz/eliza/) to get started!

---

### Community & contact

- [GitHub Issues](https://github.com/elizaos/eliza/issues). Best for: bugs you encounter using Eliza, and feature proposals.
- [elizaOS Discord](https://discord.gg/elizaos). Best for: hanging out with the elizaOS technical community
- [DAO Discord](https://discord.gg/ai16z). Best for: hanging out with the larger non-technical community

## Citation

We now have a [paper](https://arxiv.org/pdf/2501.06781) you can cite for the Eliza OS:
```bibtex
@article{walters2025eliza,
  title={Eliza: A Web3 friendly AI Agent Operating System},
  author={Walters, Shaw and Gao, Sam and Nerd, Shakker and Da, Feng and Williams, Warren and Meng, Ting-Chien and Han, Hunter and He, Frank and Zhang, Allen and Wu, Ming and others},
  journal={arXiv preprint arXiv:2501.06781},
  year={2025}
}
```

## Contributors

<a href="https://github.com/elizaos/eliza/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=elizaos/eliza" alt="Eliza project contributors" />
</a>


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=elizaos/eliza&type=Date)](https://star-history.com/#elizaos/eliza&Date)

## 🛠️ System Requirements

### Minimum Requirements
- CPU: Dual-core processor
- RAM: 4GB
- Storage: 1GB free space
- Internet connection: Broadband (1 Mbps+)

### Software Requirements
- Python 2.7+ (3.8+ recommended)
- Node.js 23+
- pnpm
- Git

### Optional Requirements
- GPU: For running local LLM models
- Additional storage: For document storage and memory
- Higher RAM: For running multiple agents

## 📁 Project Structure
```
eliza/
├── packages/
│   ├── core/           # Core Eliza functionality
│   ├── clients/        # Client implementations
│   └── actions/        # Custom actions
├── docs/              # Documentation
├── scripts/           # Utility scripts
└── examples/          # Example implementations
```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Getting Started
1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run tests: `pnpm test`
5. Submit a pull request

### Types of Contributions
- 🐛 Bug fixes
- ✨ New features
- 📚 Documentation improvements
- 🌍 Translations
- 🧪 Test improvements

### Code Style
- Follow the existing code style
- Add comments for complex logic
- Update documentation for changes
- Add tests for new features
