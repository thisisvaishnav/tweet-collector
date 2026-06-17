package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
)

// OpenAIEmbeddingResponse represents the response from OpenAI embedding API
type OpenAIEmbeddingResponse struct {
	Data []struct {
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
}

// OpenAIChatResponse represents the response from OpenAI chat completion API
type OpenAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// AnthropicResponse represents the response from Claude messaging API
type AnthropicResponse struct {
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
}

// CosineSimilarity computes the similarity between two vector slices
func CosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dotProduct, normA, normB float64
	for i := 0; i < len(a); i++ {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dotProduct / (math.Sqrt(normA) * math.Sqrt(normB))
}

// GenerateEmbedding calls OpenAI to generate text embedding vector
func GenerateEmbedding(text string) ([]float64, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY not configured")
	}

	reqBody, err := json.Marshal(map[string]interface{}{
		"model": "text-embedding-3-small",
		"input": text,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/embeddings", bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("OpenAI API error (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var embeddingResp OpenAIEmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&embeddingResp); err != nil {
		return nil, err
	}

	if len(embeddingResp.Data) == 0 {
		return nil, fmt.Errorf("empty embedding data received")
	}

	return embeddingResp.Data[0].Embedding, nil
}

// ClassificationResult represents the parsed AI details for a tweet structure
type ClassificationResult struct {
	Pattern        string `json:"pattern"`
	HookText       string `json:"hook_text"`
	HookType       string `json:"hook_type"`
	StructureNotes string `json:"structure_notes"`
}

const ClassificationPrompt = `You are an expert copywriter and social media analyst. Your task is to analyze a tweet and classify its structure, hook, and metadata.

You MUST analyze the tweet and return a JSON object with the following fields:
1. "pattern": Must be exactly one of: "contrarian_take", "personal_story", "build_in_public", "data_shock", "prediction", "callout", "listicle", "observation".
2. "hook_text": The exact first line/sentence of the tweet that acts as the hook.
3. "hook_type": Must be exactly one of: "question", "stat", "bold_claim", "story_opener", "direct_address".
4. "structure_notes": A brief note explaining the core hook/story mechanism.

Categories:
- "contrarian_take": Disagrees with common wisdom (e.g. "Everyone says X. They're wrong.")
- "personal_story": Narrative with an unexpected turn or lesson
- "build_in_public": "I built X, here's what happened / what I learned"
- "data_shock": Leads with a surprising number or fact
- "prediction": Bold claim about the future
- "callout": Names a problem, pattern, or behavior in the industry
- "listicle": Structured list of tips, tools, lessons (threads)
- "observation": Short, punchy, single insight with no narrative

Hook Types:
- "question": Starts with a question to provoke thought.
- "stat": Leads with a statistic or shocking data point.
- "bold_claim": Makes an assertive, contrarian, or surprising statement.
- "story_opener": Begins a narrative (e.g., "3 years ago I was...").
- "direct_address": Speaks directly to the reader (e.g., "If you are X, read this").

Few-Shot Examples:
Example 1:
Tweet: "AI agents won't replace software engineers. They will replace project managers. Here is why most founders are looking at this wrong..."
JSON: {"pattern": "contrarian_take", "hook_text": "AI agents won't replace software engineers.", "hook_type": "bold_claim", "structure_notes": "Asserts a counter-intuitive view on engineering vs management."}

Example 2:
Tweet: "In 2021, I was fired from my engineering job. I had $500 in my bank account. Instead of applying for jobs, I spent 12 hours a day coding..."
JSON: {"pattern": "personal_story", "hook_text": "In 2021, I was fired from my engineering job.", "hook_type": "story_opener", "structure_notes": "Starts with a low point to build empathy and narrative tension."}

Example 3:
Tweet: "I built and launched a simple database UI tool in 48 hours. It just hit $1,200 in monthly recurring revenue. Here is the exact stack..."
JSON: {"pattern": "build_in_public", "hook_text": "I built and launched a simple database UI tool in 48 hours.", "hook_type": "stat", "structure_notes": "Shares direct revenue and build metrics to show credibility."}

Example 4:
Tweet: "We analyzed 10,000 SaaS websites and discovered that 84% of them load slower than 3 seconds. Here is the single biggest culprit..."
JSON: {"pattern": "data_shock", "hook_text": "We analyzed 10,000 SaaS websites and discovered that 84% of them load slower than 3 seconds.", "hook_type": "stat", "structure_notes": "Leads with large sample size study to hook with authority."}

Example 5:
Tweet: "By 2028, 90% of all software will be written by localized agent teams, not offshore developers. If you are a developer, here is how to prepare..."
JSON: {"pattern": "prediction", "hook_text": "By 2028, 90% of all software will be written by localized agent teams, not offshore developers.", "hook_type": "bold_claim", "structure_notes": "Makes a specific, time-bound prediction about the tech landscape."}

Example 6:
Tweet: "Stop adding AI wrappers to everything. If your product is just a text prompt box on top of OpenAI, you don't have a startup."
JSON: {"pattern": "callout", "hook_text": "Stop adding AI wrappers to everything.", "hook_type": "direct_address", "structure_notes": "Uses direct command and industry critique to command attention."}

Example 7:
Tweet: "I've spent 5 years building SaaS products. Here are 7 tools that will save you 20+ hours of coding every single week: 1. Supabase..."
JSON: {"pattern": "listicle", "hook_text": "I've spent 5 years building SaaS products.", "hook_type": "story_opener", "structure_notes": "Pairs professional authority with a structured resource list."}

Example 8:
Tweet: "Great engineers don't write more code. They delete code. The best feature is the one you didn't have to build."
JSON: {"pattern": "observation", "hook_text": "Great engineers don't write more code.", "hook_type": "bold_claim", "structure_notes": "Offers a concise, clean professional wisdom tidbit."}

Response MUST be a valid JSON object. Do not include markdown wrappers (like json block formatting) or explanation. Return only the JSON string.

Tweet to classify:
%s`

// AnalyzeTweetAI processes a tweet and classifies its structure, hook, type and notes
func AnalyzeTweetAI(text string) (ClassificationResult, error) {
	var result ClassificationResult
	result.Pattern = "Unclassified"

	openaiKey := os.Getenv("OPENAI_API_KEY")
	anthropicKey := os.Getenv("ANTHROPIC_API_KEY")

	if openaiKey == "" && anthropicKey == "" {
		return result, fmt.Errorf("AI keys not set. Classification disabled")
	}

	formattedPrompt := fmt.Sprintf(ClassificationPrompt, text)

	// 1. Try Claude first if key is available
	if anthropicKey != "" {
		log.Println("Classifying tweet using Claude...")
		reqBody, err := json.Marshal(map[string]interface{}{
			"model":      "claude-3-5-haiku-20241022",
			"max_tokens": 300,
			"messages": []map[string]string{
				{"role": "user", "content": formattedPrompt},
			},
		})
		if err == nil {
			req, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewBuffer(reqBody))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("x-api-key", anthropicKey)
				req.Header.Set("anthropic-version", "2023-06-01")

				client := &http.Client{}
				resp, err := client.Do(req)
				if err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						var antResp AnthropicResponse
						if err := json.NewDecoder(resp.Body).Decode(&antResp); err == nil && len(antResp.Content) > 0 {
							jsonText := strings.TrimSpace(antResp.Content[0].Text)
							// Handle potential markdown block wrapper
							jsonText = strings.TrimPrefix(jsonText, "```json")
							jsonText = strings.TrimPrefix(jsonText, "```")
							jsonText = strings.TrimSuffix(jsonText, "```")
							jsonText = strings.TrimSpace(jsonText)
							
							if err := json.Unmarshal([]byte(jsonText), &result); err == nil {
								return result, nil
							}
							log.Printf("Claude classification JSON unmarshal failed: %v", err)
						}
					} else {
						bodyBytes, _ := io.ReadAll(resp.Body)
						log.Printf("Claude API error: %s", string(bodyBytes))
					}
				}
			}
		}
	}

	// 2. Fallback to OpenAI if key is available
	if openaiKey != "" {
		log.Println("Classifying tweet using OpenAI...")
		reqBody, err := json.Marshal(map[string]interface{}{
			"model": "gpt-4o-mini",
			"messages": []map[string]interface{}{
				{"role": "system", "content": "You are a classifier. Respond with ONLY a valid JSON object matching the requested schema. Do not output markdown blocks."},
				{"role": "user", "content": formattedPrompt},
			},
			"max_tokens":  300,
			"temperature": 0.0,
			"response_format": map[string]string{
				"type": "json_object",
			},
		})
		if err == nil {
			req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(reqBody))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+openaiKey)

				client := &http.Client{}
				resp, err := client.Do(req)
				if err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						var chatResp OpenAIChatResponse
						if err := json.NewDecoder(resp.Body).Decode(&chatResp); err == nil && len(chatResp.Choices) > 0 {
							jsonText := strings.TrimSpace(chatResp.Choices[0].Message.Content)
							if err := json.Unmarshal([]byte(jsonText), &result); err == nil {
								return result, nil
							}
							log.Printf("OpenAI classification JSON unmarshal failed: %v", err)
						}
					} else {
						bodyBytes, _ := io.ReadAll(resp.Body)
						log.Printf("OpenAI API error: %s", string(bodyBytes))
					}
				}
			}
		}
	}

	return result, fmt.Errorf("failed to complete AI analysis")
}

// SuggestPatternForTopic suggests which of the 8 patterns fits a topic best
func SuggestPatternForTopic(topic string) (string, error) {
	openaiKey := os.Getenv("OPENAI_API_KEY")
	anthropicKey := os.Getenv("ANTHROPIC_API_KEY")

	if openaiKey == "" && anthropicKey == "" {
		return "build_in_public", nil // default
	}

	systemPrompt := "You are a social media strategist. Suggest which copywriting pattern best fits the user's topic. Choose exactly one from: contrarian_take, personal_story, build_in_public, data_shock, prediction, callout, listicle, observation. Return ONLY the category name."
	userPrompt := "Topic: " + topic

	// Claude
	if anthropicKey != "" {
		reqBody, err := json.Marshal(map[string]interface{}{
			"model":      "claude-3-5-haiku-20241022",
			"max_tokens": 20,
			"system":     systemPrompt,
			"messages": []map[string]string{
				{"role": "user", "content": userPrompt},
			},
		})
		if err == nil {
			req, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewBuffer(reqBody))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("x-api-key", anthropicKey)
				req.Header.Set("anthropic-version", "2023-06-01")

				client := &http.Client{}
				resp, err := client.Do(req)
				if err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						var antResp AnthropicResponse
						if err := json.NewDecoder(resp.Body).Decode(&antResp); err == nil && len(antResp.Content) > 0 {
							return strings.TrimSpace(antResp.Content[0].Text), nil
						}
					}
				}
			}
		}
	}

	// OpenAI
	if openaiKey != "" {
		reqBody, err := json.Marshal(map[string]interface{}{
			"model": "gpt-4o-mini",
			"messages": []map[string]interface{}{
				{"role": "system", "content": systemPrompt},
				{"role": "user", "content": userPrompt},
			},
			"max_tokens":  20,
			"temperature": 0.0,
		})
		if err == nil {
			req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(reqBody))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+openaiKey)

				client := &http.Client{}
				resp, err := client.Do(req)
				if err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						var chatResp OpenAIChatResponse
						if err := json.NewDecoder(resp.Body).Decode(&chatResp); err == nil && len(chatResp.Choices) > 0 {
							return strings.TrimSpace(chatResp.Choices[0].Message.Content), nil
						}
					}
				}
			}
		}
	}

	return "build_in_public", nil
}

// GenerateSimilarTweet drafts a new tweet mimicking the structure of selected examples
func GenerateSimilarTweet(topic string, pattern string, examples []string) (string, error) {
	openaiKey := os.Getenv("OPENAI_API_KEY")
	anthropicKey := os.Getenv("ANTHROPIC_API_KEY")

	if openaiKey == "" && anthropicKey == "" {
		return "", fmt.Errorf("AI keys not set. Set OPENAI_API_KEY or ANTHROPIC_API_KEY to generate tweets")
	}

	var examplesStr strings.Builder
	for i, ex := range examples {
		examplesStr.WriteString(fmt.Sprintf("EXAMPLE %d:\n%s\n\n", i+1, ex))
	}

	systemPrompt := "You are a master writer who analyzes structures of viral social media posts and replicates their templates, pacing, hooks, line breaks, and styling with new topics. Output only the finished post. Do not include markdown labels or commentary."
	
	patternDesc := ""
	if pattern != "" && pattern != "All" {
		patternDesc = fmt.Sprintf("The target copywriting pattern is '%s'. Make sure the output matches this structural type.", pattern)
	}

	userPrompt := fmt.Sprintf("Topic to write about: %s\n\n%s\n\nAnalyze the structural formatting, cadence, and hook style of the examples below, and write a new post on the topic following their structures exactly.\n\n%s", topic, patternDesc, examplesStr.String())

	// Try Claude first
	if anthropicKey != "" {
		reqBody, err := json.Marshal(map[string]interface{}{
			"model":      "claude-3-5-sonnet-latest",
			"max_tokens": 500,
			"system":     systemPrompt,
			"messages": []map[string]string{
				{"role": "user", "content": userPrompt},
			},
		})
		if err == nil {
			req, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewBuffer(reqBody))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("x-api-key", anthropicKey)
				req.Header.Set("anthropic-version", "2023-06-01")

				client := &http.Client{}
				resp, err := client.Do(req)
				if err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						var antResp AnthropicResponse
						if err := json.NewDecoder(resp.Body).Decode(&antResp); err == nil && len(antResp.Content) > 0 {
							return strings.TrimSpace(antResp.Content[0].Text), nil
						}
					}
				}
			}
		}
	}

	// Try OpenAI
	if openaiKey != "" {
		reqBody, err := json.Marshal(map[string]interface{}{
			"model": "gpt-4o-mini",
			"messages": []map[string]interface{}{
				{"role": "system", "content": systemPrompt},
				{"role": "user", "content": userPrompt},
			},
			"max_tokens":  500,
			"temperature": 0.8,
		})
		if err == nil {
			req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(reqBody))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+openaiKey)

				client := &http.Client{}
				resp, err := client.Do(req)
				if err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						var chatResp OpenAIChatResponse
						if err := json.NewDecoder(resp.Body).Decode(&chatResp); err == nil && len(chatResp.Choices) > 0 {
							return strings.TrimSpace(chatResp.Choices[0].Message.Content), nil
						}
					}
				}
			}
		}
	}

	return "", fmt.Errorf("failed to generate tweet using AI APIs")
}
