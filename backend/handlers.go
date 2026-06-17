package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
)

// Niche filtering lists
var NicheSeedAccounts = map[string]bool{
	"sama":             true,
	"karpathy":         true,
	"levelsio":         true,
	"dhh":              true,
	"paulg":            true,
	"pmarca":           true,
	"naval":            true,
	"balajis":          true,
	"swyx":             true,
	"leeerob":          true,
	"nutlope":          true,
	"spdustin":         true,
	"patio11":          true,
	"bindureddy":       true,
	"drjimfan":         true,
	"ylecun":           true,
	"andrewng":         true,
	"gdb":              true,
	"satya":            true,
	"sundarpichai":     true,
	"woj_zaremba":      true,
	"dannypostma":      true,
	"marckohlbrugge":   true,
	"levels_io":        true,
	"huggingface":      true,
	"thom_wolf":        true,
	"julien_c":         true,
	"clem_delangue":    true,
	"gregkamradt":      true,
	"rowancheung":      true,
	"bentossell":       true,
	"natfriedman":      true,
	"danielgross":      true,
	"lachy":            true,
	"pwang":            true,
	"mzkline":          true,
	"tylercowen":       true,
	"collision":        true,
	"jason":            true,
	"alexvoica":        true,
	"emollick":         true,
	"hardmaru":         true,
	"charlie_gerard":   true,
	"sulily":           true,
	"cassiekozyrkov":   true,
	"alliekmiller":     true,
	"fchollet":         true,
	"goodfellow_ian":   true,
	"lexfridman":       true,
	"vitalikbuterin":   true,
	"id_aa_carmack":    true,
	"gvanrossum":       true,
	"tenderlove":       true,
	"wycats":           true,
	"dhh_on_rails":     true,
	"adamwathan":       true,
	"taylorotwell":     true,
	"rauchg":           true,
	"yyx990803":        true,
	"dan_abramov":      true,
	"sebmarkbage":      true,
	"sophiebits":       true,
	"wesbos":           true,
	"stolinski":        true,
	"kentcdodds":       true,
	"housecor":         true,
	"codyhouse":        true,
	"sarah_edo":        true,
	"mgechev":          true,
	"addyosmani":       true,
	"paul_irish":       true,
	"sindresorhus":     true,
	"tjholowaychuk":    true,
	"ryansolid":        true,
	"rich_harris":      true,
	"mjackson":         true,
	"ryanflorence":     true,
	"acdlite":          true,
	"sebmck":           true,
	"trueadm":          true,
	"swannodette":      true,
	"haxxx":            true,
	"igrigorik":        true,
	"brianleroux":      true,
	"mislav":           true,
	"defunkt":          true,
	"pjhyett":          true,
	"mojombo":          true,
	"schacon":          true,
	"mattt":            true,
	"charlie_gerard_":  true,
}

var NicheKeywords = []string{
	"startup", "ai", "shipped", "founder", "saas", "built", "api", "coding",
	"solopreneur", "indie hacker", "indiehackers", "database", "postgres",
	"javascript", "typescript", "python", "golang", "react", "nextjs",
	"machine learning", "deep learning", "llm", "claude", "chatgpt", "openai",
	"gpu", "vector db", "rag", "deploy", "vercel", "supabase", "aws", "docker",
	"github", "open source", "micro-saas", "indie-hacker", "bootstrapped",
	"build in public", "product hunt", "launching", "mvp", "developer", "engineering",
}

var ExclusionKeywords = []string{
	"football", "soccer", "basketball", "nba", "nfl", "premier league", "champions league",
	"election", "senate", "republican", "democrat", "biden", "trump", "politician", "congress",
	"kardashian", "taylor swift", "gossip", "hollywood", "scandal", "celeb", "celebrity",
	"justin bieber", "oscars", "grammys", "superbowl", "olympics", "world cup",
	"sports bet", "betting", "casino", "war in", "senator", "parliament", "breaking news",
}

func isCandidate(text string, author string) bool {
	// Extract handle from author string (format: "Display Name (@handle)")
	handleClean := ""
	if idx := strings.Index(author, "("); idx != -1 {
		handlePart := author[idx+1:]
		if endIdx := strings.Index(handlePart, ")"); endIdx != -1 {
			handleClean = strings.ToLower(strings.TrimPrefix(handlePart[:endIdx], "@"))
		}
	}
	if handleClean == "" {
		handleClean = strings.ToLower(strings.TrimPrefix(author, "@"))
	}

	// 1. Seed accounts check
	if NicheSeedAccounts[handleClean] {
		return true
	}

	textLower := strings.ToLower(text)

	// 2. Exclusion keywords check
	for _, kw := range ExclusionKeywords {
		if strings.Contains(textLower, kw) {
			return false
		}
	}

	// 3. Niche keywords check
	for _, kw := range NicheKeywords {
		if strings.Contains(textLower, kw) {
			return true
		}
	}

	return false
}

func getFollowerBucket(followers int) string {
	if followers < 5000 {
		return "micro"
	} else if followers < 50000 {
		return "small"
	} else if followers < 500000 {
		return "mid"
	}
	return "large"
}

func calculateEngagementRate(likes, reposts, replies, followers, views int) float64 {
	if followers > 0 {
		// Formula: (likes + reposts*2 + replies*1.5) / followers * 100
		return (float64(likes) + float64(reposts)*2.0 + float64(replies)*1.5) / float64(followers) * 100.0
	}
	return 0.0
}

func isViral(engagementRate float64, followers int) bool {
	if followers <= 0 {
		return false
	}
	bucket := getFollowerBucket(followers)
	switch bucket {
	case "micro":
		return engagementRate > 15.0 // 15%+
	case "small":
		return engagementRate > 5.0  // 5%+
	case "mid":
		return engagementRate > 2.0  // 2%+
	case "large":
		return engagementRate > 0.8  // 0.8%+
	}
	return false
}

// HTTP Response helpers
func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, map[string]string{"error": message})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, err := json.Marshal(payload)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Internal Server Error"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

// Handler: CORS helper
func handleOptions(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return true
	}
	return false
}

// Handler: POST /save
func saveTweetHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		respondWithError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		ID        string `json:"id"`
		Text      string `json:"text"`
		Author    string `json:"author"`
		Followers int    `json:"followers"`
		Likes     int    `json:"likes"`
		Replies   int    `json:"replies"`
		Reposts   int    `json:"reposts"`
		Views     int    `json:"views"`
		URL       string `json:"url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if req.ID == "" || req.Text == "" {
		respondWithError(w, http.StatusBadRequest, "ID and Text are required")
		return
	}

	// Calculate metrics using new formulas with views-based fallback
	engagementRate := calculateEngagementRate(req.Likes, req.Reposts, req.Replies, req.Followers, req.Views)
	candidateFlag := isCandidate(req.Text, req.Author)
	viralFlag := isViral(engagementRate, req.Followers)

	tweet := Tweet{
		ID:             req.ID,
		Text:           req.Text,
		Author:         req.Author,
		Followers:      req.Followers,
		Likes:          req.Likes,
		Replies:        req.Replies,
		Reposts:        req.Reposts,
		Views:          req.Views,
		EngagementRate: engagementRate,
		URL:            req.URL,
		IsViral:        viralFlag,
		IsCandidate:    candidateFlag,
	}

	if err := SaveTweet(&tweet); err != nil {
		log.Printf("Error saving tweet: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to save tweet")
		return
	}

	log.Printf("Tweet %s saved (followers=%d, rate=%.2f%%, candidate=%v, viral=%v). Spawning AI classification...", 
		req.ID, req.Followers, engagementRate, candidateFlag, viralFlag)

	// Async classification and embeddings
	go func(id string, text string) {
		res, err := AnalyzeTweetAI(text)
		if err != nil {
			log.Printf("AI classification failed for tweet %s: %v", id, err)
			res = ClassificationResult{
				Pattern: "Unclassified",
			}
		}

		var embedding []float64
		if os.Getenv("OPENAI_API_KEY") != "" {
			emb, err := GenerateEmbedding(text)
			if err != nil {
				log.Printf("AI embedding generation failed for tweet %s: %v", id, err)
			} else {
				embedding = emb
			}
		}

		if err := UpdateTweetAdvancedAI(id, res.Pattern, res.HookText, res.HookType, res.StructureNotes, "llm_classified", embedding); err != nil {
			log.Printf("Failed to update AI details in database for tweet %s: %v", id, err)
		} else {
			log.Printf("Successfully updated AI details for tweet %s: pattern=%s, hook_type=%s, embedding_dimension=%d", 
				id, res.Pattern, res.HookType, len(embedding))
		}
	}(tweet.ID, tweet.Text)

	respondWithJSON(w, http.StatusOK, map[string]string{"status": "saved", "id": tweet.ID})
}

// Handler: GET /tweets
func listTweetsHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "GET" {
		respondWithError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	search := r.URL.Query().Get("search")
	pattern := r.URL.Query().Get("pattern")
	sortBy := r.URL.Query().Get("sortBy")
	limitStr := r.URL.Query().Get("limit")

	limit := 100
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil {
			limit = val
		}
	}

	tweets, err := GetTweets(search, pattern, sortBy, limit)
	if err != nil {
		log.Printf("Error fetching tweets: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to query database")
		return
	}

	respondWithJSON(w, http.StatusOK, tweets)
}

type SemanticSearchRequest struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

type SemanticSearchResponse struct {
	Tweet
	Similarity float64 `json:"similarity"`
}

// Handler: POST /search-semantic
func semanticSearchHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		respondWithError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if os.Getenv("OPENAI_API_KEY") == "" {
		respondWithError(w, http.StatusBadRequest, "OpenAI API Key is not set on the server. Semantic search disabled.")
		return
	}

	var req SemanticSearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Query == "" {
		respondWithError(w, http.StatusBadRequest, "Query string is required")
		return
	}

	if req.Limit <= 0 {
		req.Limit = 10
	}

	// 1. Generate query embedding
	queryEmbedding, err := GenerateEmbedding(req.Query)
	if err != nil {
		log.Printf("Failed to generate embedding for query: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to analyze search query")
		return
	}

	// 2. Fetch all tweets with embeddings from database
	tweets, err := GetAllEmbeddings()
	if err != nil {
		log.Printf("Failed to load embeddings: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch database index")
		return
	}

	// 3. Compute cosine similarities
	var results []SemanticSearchResponse
	for _, t := range tweets {
		if len(t.Embedding) > 0 {
			similarity := CosineSimilarity(queryEmbedding, t.Embedding)
			results = append(results, SemanticSearchResponse{
				Tweet:      t,
				Similarity: similarity,
			})
		}
	}

	// 4. Sort results by similarity descending
	sort.Slice(results, func(i, j int) bool {
		return results[i].Similarity > results[j].Similarity
	})

	// 5. Slice top items
	if len(results) > req.Limit {
		results = results[:req.Limit]
	}

	respondWithJSON(w, http.StatusOK, results)
}

// Handler: POST /generate
func generateTweetHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		respondWithError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Topic      string   `json:"topic"`
		ExampleIDs []string `json:"example_ids"`
		Pattern    string   `json:"pattern"` // optional: e.g. "build_in_public"
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Topic == "" {
		respondWithError(w, http.StatusBadRequest, "Topic is required")
		return
	}

	var examples []string
	var selectedPattern = req.Pattern

	// 1. If pattern is "auto" (or empty) AND no manual example IDs are selected, auto-detect pattern
	if (selectedPattern == "" || selectedPattern == "auto" || selectedPattern == "Auto-detect") && len(req.ExampleIDs) == 0 {
		detectedPattern, err := SuggestPatternForTopic(req.Topic)
		if err != nil {
			log.Printf("Pattern auto-suggestion failed: %v. Using build_in_public.", err)
			selectedPattern = "build_in_public" // fallback
		} else {
			selectedPattern = detectedPattern
			log.Printf("Auto-detected pattern '%s' for topic '%s'", selectedPattern, req.Topic)
		}
	}

	// 2. Retrieve examples
	if len(req.ExampleIDs) > 0 {
		// Manual selection: Retrieve selected examples from database
		tweets, err := GetTweets("", "All", "newest", 1000)
		if err != nil {
			log.Printf("Failed to fetch tweets for styling: %v", err)
			respondWithError(w, http.StatusInternalServerError, "Failed to retrieve example database")
			return
		}

		idMap := make(map[string]string)
		for _, t := range tweets {
			idMap[t.ID] = t.Text
		}

		for _, id := range req.ExampleIDs {
			if text, exists := idMap[id]; exists {
				examples = append(examples, text)
			}
		}
	} else if selectedPattern != "" && selectedPattern != "All" {
		// Pattern-based retrieval: Get examples matching selected pattern
		patternTweets, err := GetTweets("", selectedPattern, "engagement", 100)
		if err != nil {
			log.Printf("Failed to fetch pattern tweets: %v", err)
			respondWithError(w, http.StatusInternalServerError, "Failed to retrieve pattern tweets")
			return
		}

		// If no tweets match this pattern yet, fallback to all viral tweets
		if len(patternTweets) == 0 {
			log.Printf("No tweets found for pattern '%s', falling back to top viral tweets", selectedPattern)
			patternTweets, err = GetTweets("", "All", "engagement", 20)
			if err != nil {
				log.Printf("Failed to fetch fallback viral tweets: %v", err)
			}
		}

		// Calculate similarity using embeddings if OpenAI key is set
		if len(patternTweets) > 0 {
			if os.Getenv("OPENAI_API_KEY") != "" {
				// Get topic embedding
				topicEmbedding, err := GenerateEmbedding(req.Topic)
				if err != nil {
					log.Printf("Failed to generate embedding for topic: %v. Using top engagement.", err)
					// Fallback: pick top 5 by engagement
					for i := 0; i < len(patternTweets) && i < 5; i++ {
						examples = append(examples, patternTweets[i].Text)
					}
				} else {
					// Rank by similarity
					type SimItem struct {
						text string
						sim  float64
					}
					var simItems []SimItem
					for _, pt := range patternTweets {
						emb := pt.Embedding
						if len(emb) == 0 {
							// Generate on the fly to cache it
							e, err := GenerateEmbedding(pt.Text)
							if err == nil {
								emb = e
								_ = UpdateTweetAI(pt.ID, pt.Pattern, emb)
							}
						}
						if len(emb) > 0 {
							sim := CosineSimilarity(topicEmbedding, emb)
							simItems = append(simItems, SimItem{text: pt.Text, sim: sim})
						} else {
							simItems = append(simItems, SimItem{text: pt.Text, sim: 0.0})
						}
					}
					// Sort descending by similarity score
					sort.Slice(simItems, func(i, j int) bool {
						return simItems[i].sim > simItems[j].sim
					})
					// Take top 5
					for i := 0; i < len(simItems) && i < 5; i++ {
						examples = append(examples, simItems[i].text)
					}
				}
			} else {
				// No OpenAI Key: pick top 5 by engagement rate
				for i := 0; i < len(patternTweets) && i < 5; i++ {
					examples = append(examples, patternTweets[i].Text)
				}
			}
		}
	}

	if len(examples) == 0 {
		respondWithError(w, http.StatusBadRequest, "No examples found to build structure. Please collect some tweets first.")
		return
	}

	// Generate similarity clone
	draft, err := GenerateSimilarTweet(req.Topic, selectedPattern, examples)
	if err != nil {
		log.Printf("AI generation error: %v", err)
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{
		"tweet":   draft,
		"pattern": selectedPattern,
	})
}


// Handler: DELETE or POST /delete
func deleteTweetHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "DELETE" && r.Method != "POST" {
		respondWithError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		// Try parsing from body as fallback
		var req struct {
			ID string `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		id = req.ID
	}

	if id == "" {
		respondWithError(w, http.StatusBadRequest, "ID is required")
		return
	}

	if err := DeleteTweet(id); err != nil {
		log.Printf("Error deleting tweet %s: %v", id, err)
		respondWithError(w, http.StatusInternalServerError, "Failed to delete tweet")
		return
	}

	log.Printf("Tweet %s deleted successfully", id)
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "deleted", "id": id})
}
