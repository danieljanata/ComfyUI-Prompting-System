/**
 * Prompt Library UI - Enhanced browser interface
 * Provides rich UI for browsing, searching, and managing prompts
 */

import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

// Custom widget for displaying prompt library
class PromptLibraryWidget {
    constructor(node, inputName, inputData, app) {
        this.node = node;
        this.name = inputName;
        this.type = "custom_prompt_library";

        // Create widget element
        const widget = {
            type: this.type,
            name: inputName,
            size: [600, 400],
            draw: function(ctx, node, widgetWidth, widgetY, height) {
                // Custom drawing if needed
            },
            computeSize: function(width) {
                return [width, 400];
            },
            value: ""
        };

        return widget;
    }
}

// Register custom widget
ComfyWidgets.PROMPTLIBRARY = function(node, inputName, inputData, app) {
    return new PromptLibraryWidget(node, inputName, inputData, app);
};

// Extension for Prompt Saver Node
app.registerExtension({
    name: "PromptingSystem.PromptSaver",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PromptSaver") {
            // Add custom styling for lock button
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // Find locked widget and add pulsing animation
                const lockedWidget = this.widgets?.find(w => w.name === "locked");

                if (lockedWidget) {
                    const originalDraw = lockedWidget.draw;

                    lockedWidget.draw = function(ctx, node, widgetWidth, y, height) {
                        // Call original draw
                        if (originalDraw) {
                            originalDraw.apply(this, arguments);
                        }

                        // Add pulsing effect when unlocked
                        if (!this.value) {
                            const time = Date.now() / 1000;
                            const pulse = Math.sin(time * 3) * 0.3 + 0.7;

                            ctx.save();
                            ctx.globalAlpha = pulse;
                            ctx.fillStyle = "#ff6b6b";
                            ctx.fillRect(node.pos[0], node.pos[1] + y - 5, widgetWidth, height + 10);
                            ctx.restore();

                            // Request redraw for animation
                            node.graph?.setDirtyCanvas(true);
                        }
                    };
                }

                return r;
            };
        }
    }
});

// Extension for Prompt Library Browser
app.registerExtension({
    name: "PromptingSystem.LibraryBrowser",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PromptLibraryBrowser") {
            // Enhance node with custom UI
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // Make node larger by default
                this.size = [600, 400];

                // Add custom title
                this.title = "📚 Prompt Library";
                this.color = "#2a2a4a";
                this.bgcolor = "#1a1a2a";

                return r;
            };

            // Handle results display
            const onExecuted = nodeType.prototype.onExecuted;

            nodeType.prototype.onExecuted = function(message) {
                if (onExecuted) {
                    onExecuted.apply(this, arguments);
                }

                // Parse and display results
                if (message?.text && message.text[2]) {
                    const resultsText = message.text[2];

                    // Try to parse as JSON
                    try {
                        const results = JSON.parse(resultsText);

                        if (Array.isArray(results)) {
                            console.log(`[Prompt Library] Loaded ${results.length} prompts`);

                            // Could create custom UI here
                            this.displayResults = results;
                        }
                    } catch (e) {
                        // Not JSON, just text info
                        console.log(`[Prompt Library] ${resultsText}`);
                    }
                }
            };
        }
    }
});

// Extension for Smart Text Input
app.registerExtension({
    name: "PromptingSystem.SmartTextInput",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SmartTextInput") {
            // Add visual indicator for change detection
            const onExecuted = nodeType.prototype.onExecuted;

            nodeType.prototype.onExecuted = function(message) {
                if (onExecuted) {
                    onExecuted.apply(this, arguments);
                }

                // Show change detection result
                if (message?.text) {
                    const isNewPrompt = message.text[1];  // boolean
                    const similarity = message.text[2];    // float

                    // Update node color based on detection
                    if (isNewPrompt) {
                        this.color = "#4a2a2a";  // Red tint for new prompt
                        this.bgcolor = "#2a1a1a";
                        console.log(`[Smart Text] New prompt detected (similarity: ${similarity.toFixed(2)})`);
                    } else {
                        this.color = "#2a2a4a";  // Blue tint for edit
                        this.bgcolor = "#1a1a2a";
                        console.log(`[Smart Text] Edit detected (similarity: ${similarity.toFixed(2)})`);
                    }

                    // Reset color after 2 seconds
                    setTimeout(() => {
                        this.color = "#222";
                        this.bgcolor = "#000";
                        app.graph?.setDirtyCanvas(true);
                    }, 2000);

                    app.graph?.setDirtyCanvas(true);
                }
            };
        }
    }
});

// Extension for Export Manager
app.registerExtension({
    name: "PromptingSystem.ExportManager",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ExportManager") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // Style node
                this.title = "📤 Export Manager";
                this.color = "#2a4a2a";
                this.bgcolor = "#1a2a1a";

                return r;
            };
        }
    }
});

console.log("🎨 Prompt Library UI extensions loaded!");
