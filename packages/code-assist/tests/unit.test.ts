/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect, test, describe, mock, beforeEach, spyOn, afterEach } from "bun:test";
import axios from "axios";
import { getUsageInstructions, getServer, handleCallTool, _setUsageInstructions, handleReadResource, startHttpServer } from "../index.js";
import { CallToolRequest, ReadResourceRequest } from "@modelcontextprotocol/sdk/types.js";
import express from 'express';
import http from 'http';

mock.module("axios", () => ({
  default: {
    get: mock(),
    post: mock(),
  },
}));

const server = getServer();
spyOn(server, "sendLoggingMessage").mockImplementation(async () => {});

describe("Google Maps Platform Code Assist MCP Server", () => {
  beforeEach(() => {
    _setUsageInstructions(null);
  });
  test("getUsageInstructions returns instructions", async () => {
    const mockResponse = {
      data: {
        systemInstructions: "system instructions",
        preamble: "preamble",
        europeanEconomicAreaTermsDisclaimer: "disclaimer",
      },
    };
    (axios.get as any).mockResolvedValue(mockResponse);

    const instructions = await getUsageInstructions(server);

    expect(instructions).toEqual([
      "system instructions",
      "preamble",
      "disclaimer",
    ]);
  });

  test("retrieve-google-maps-platform-docs tool calls RAG service", async () => {
    const mockResponse = {
      data: {
        contexts: [],
      },
      status: 200,
    };
    (axios.post as any).mockResolvedValue(mockResponse);

    const request = {
      method: "tools/call" as const,
      params: {
        name: "retrieve-google-maps-platform-docs",
        arguments: {
          prompt: "How do I add Places New to my mobile app?",
        },
      },
    };

    await handleCallTool(request as CallToolRequest, server);

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/chat"),
      expect.objectContaining({
        message: "How do I add Places New to my mobile app?",
      })
    );
  });
  test("getUsageInstructions returns null on error", async () => {
    (axios.get as any).mockRejectedValue(new Error("Network error"));

    const instructions = await getUsageInstructions(server);

    expect(instructions).toBeNull();
  });

  test("retrieve-instructions tool returns instructions", async () => {
    const mockResponse = {
      data: {
        systemInstructions: "system instructions",
        preamble: "preamble",
        europeanEconomicAreaTermsDisclaimer: "disclaimer",
      },
    };
    (axios.get as any).mockResolvedValue(mockResponse);

    const request = {
      method: "tools/call" as const,
      params: {
        name: "retrieve-instructions",
      },
    };

    const result = await handleCallTool(request as CallToolRequest, server);

    expect(result.content?.[0].text).toContain("system instructions");
  });

  test("read instructions resource returns instructions", async () => {
    const mockResponse = {
      data: {
        systemInstructions: "system instructions",
        preamble: "preamble",
        europeanEconomicAreaTermsDisclaimer: "disclaimer",
      },
    };
    (axios.get as any).mockResolvedValue(mockResponse);

    const request = {
      method: "resources/read" as const,
      params: {
        uri: "mcp://google-maps-platform-code-assist/instructions",
      },
    };

    const result = await handleReadResource(request as ReadResourceRequest, server);

    expect(result.contents?.[0].text).toContain("system instructions");
  });

  test("read invalid resource returns error", async () => {
    const request = {
      method: "resources/read" as const,
      params: {
        uri: "mcp://google-maps-platform-code-assist/invalid",
      },
    };

    const result = await handleReadResource(request as ReadResourceRequest, server);

    expect(result.contents?.[0].text).toBe("Invalid Resource URI");
  });

  test("retrieve-google-maps-platform-docs tool returns error on failure", async () => {
    (axios.post as any).mockRejectedValue(new Error("RAG error"));

    const request = {
      method: "tools/call" as const,
      params: {
        name: "retrieve-google-maps-platform-docs",
        arguments: {
          prompt: "test prompt",
        },
      },
    };

    const result = await handleCallTool(request as CallToolRequest, server);

    expect(result.content?.[0].text).toContain("No information available");
  });

  test("invalid tool call returns error", async () => {
    const request = {
      method: "tools/call" as const,
      params: {
        name: "invalid-tool",
      },
    };

    const result = await handleCallTool(request as CallToolRequest, server);

    expect(result.content?.[0].text).toBe("Invalid Tool called");
  });
});

describe("startHttpServer", () => {
    let app: express.Express;
    let testServer: http.Server;
    const testPort = 5001;

    beforeEach(() => {
        app = express();
    });

    afterEach((done: () => void) => {
        if (testServer && testServer.listening) {
            testServer.close(() => done());
        } else {
            done();
        }
    });

    test("should start on a random port if the preferred port is in use", async () => {
        // Create a server to occupy the port
        await new Promise<void>(resolve => {
            testServer = http.createServer((req, res) => {
                res.writeHead(200);
                res.end('hello world');
            });
            testServer.listen(testPort, () => resolve());
        });

        const server = await startHttpServer(app, testPort);
        const address = server.address();
        const listeningPort = (address && typeof address === 'object') ? address.port : 0;

        expect(listeningPort).not.toBe(testPort);
        expect(listeningPort).toBeGreaterThan(0);

        await new Promise<void>(resolve => server.close(() => resolve()));
    });
});