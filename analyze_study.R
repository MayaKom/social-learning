# =============================================================================
# Learning from Alex (similarity-learning study): combine data files + quick analysis
# =============================================================================
#
# 1. Download the server's data folder (WinSCP: drag `data` to your computer).
# 2. Set `data_dir` below to that folder, and list your own test runs in `test_ids`.
# 3. Run the whole script (in RStudio: Source, or Ctrl+Shift+Enter).
#
# Output (in `out_dir`):
#   trials_all.csv    every screen of every participant, one row each
#   participants.csv  one row per participant, with all the measures used below
#   far_transfer.png  plot of the main outcome (if ggplot2 is installed)
#
# Packages: dplyr, tidyr, readr, jsonlite (required); lme4, ggplot2 (optional).
# install.packages(c("dplyr", "tidyr", "readr", "jsonlite", "lme4", "ggplot2"))

suppressPackageStartupMessages({
  library(dplyr); library(tidyr); library(readr); library(jsonlite)
})

# ---- Settings ---------------------------------------------------------------
data_dir   <- "data"                 # folder with the downloaded CSV files
out_dir    <- "analysis_output"      # where combined files and the plot are written
study_name <- "similarity-learning"  # keeps only this study's files (the folder is shared)
test_ids   <- c()                    # Prolific IDs of your own test runs, e.g. c("test123")

# Optional data-quality exclusions (decide these before looking at the results).
exclude_pasted_text     <- FALSE     # drop participants who pasted into the open question (strategy question in version 0.1.0)
max_seconds_away_demos  <- Inf       # drop participants away from the tab longer than this during Alex's rounds

# Adjust the models for value version (which resource is worth what)? With few participants per
# condition x version cell the adjusted models cannot be estimated, so by default it is only done
# once there are at least 40 analysed participants.
adjust_for_version <- "auto"         # "auto", TRUE or FALSE

dir.create(out_dir, showWarnings = FALSE)

# ---- Helpers ----------------------------------------------------------------
# The server stores TRUE as "1" and FALSE as an empty cell; files saved by jsPsych itself use "true"/"false".
as_bool <- function(x) !is.na(x) & tolower(x) %in% c("1", "true")
num     <- function(x) suppressWarnings(as.numeric(x))
first_value <- function(x) { x <- x[!is.na(x) & x != ""]; if (length(x)) x[1] else NA_character_ }
# Answers to questionnaires are stored as small JSON texts, e.g. {"ease":3,"similarity":5}.
json_field <- function(x, field) vapply(x, function(s) {
  if (is.na(s) || s == "") return(NA_character_)
  v <- tryCatch(fromJSON(s)[[field]], error = function(e) NULL)
  if (is.null(v)) NA_character_ else as.character(v)
}, character(1), USE.NAMES = FALSE)
ensure_cols <- function(df, cols) { for (cl in setdiff(cols, names(df))) df[[cl]] <- NA_character_; df }
section <- function(title) cat("\n", strrep("=", 78), "\n ", title, "\n", strrep("=", 78), "\n", sep = "")

# ---- 1. Import and combine --------------------------------------------------
files <- list.files(data_dir, pattern = "\\.csv$", full.names = TRUE)
files <- files[basename(files) != "index.csv"]
if (!length(files)) stop("No CSV files found in '", data_dir, "'. Check data_dir.")

trials <- bind_rows(lapply(files, function(f)
  read_csv(f, col_types = cols(.default = col_character()), show_col_types = FALSE, progress = FALSE) %>%
    mutate(source_file = basename(f))))

trials <- ensure_cols(trials, c("meta_study", "assignment", "comprehension_failed", "focus_lost_count",
                                "focus_lost_ms", "paste_count", "pasted_chars", "probe_correct", "confidence",
                                "study_version", "q_confusing", "q_common", "q_like", "q_imagine_hard", "q_aim",
                                "q_aim_other", "q_answers_memory", "q_real", "q_real_explain", "q_matching_belief"))

section("1. Files")
cat("CSV files read:", length(files), "\n")
if (any(!is.na(trials$meta_study))) {
  other <- trials %>% filter(is.na(meta_study) | meta_study != study_name) %>% distinct(source_file) %>% nrow()
  trials <- trials %>% filter(meta_study == study_name)
  cat("Files from other studies dropped:", other, "\n")
}
# Test runs: conditions forced through the link (assignment = "url") or IDs listed in test_ids.
test_runs <- trials %>% filter(assignment == "url" | participant_id %in% test_ids) %>% distinct(participant_id, source_file)
trials <- trials %>% filter(!(assignment %in% "url"), !(participant_id %in% test_ids))
cat("Test-run files dropped:", nrow(test_runs), "\n")

# The same person could appear twice (e.g. a reload); keep their most complete file.
keep <- trials %>% count(participant_id, source_file, name = "rows") %>%
  group_by(participant_id) %>% arrange(desc(rows), source_file) %>% slice(1) %>% ungroup()
dups <- n_distinct(trials$source_file) - nrow(keep)
trials <- trials %>% semi_join(keep, by = c("participant_id", "source_file"))
if (dups > 0) cat("Duplicate files from the same participant dropped:", dups, "\n")
cat("Participants:", n_distinct(trials$participant_id), "\n")

# ---- 2. One row per participant ---------------------------------------------
tests <- trials %>% filter(task == "test") %>%
  transmute(participant_id, test_id, test_kind, choice_rank, choice_item,
            chose_best = choice_rank == "best", chose_second = choice_rank == "second",
            points = num(points), rt = num(rt))

per_test <- tests %>% group_by(participant_id) %>% summarise(
  far_trials        = sum(test_kind == "far"),
  far_best_n        = sum(chose_best[test_kind == "far"]),
  far_best_prop     = mean(chose_best[test_kind == "far"]),
  far_second_prop   = mean(chose_second[test_kind == "far"]),
  near_second_prop  = mean(chose_second[test_kind == "near"]),
  test_points       = sum(points), .groups = "drop")

participants <- trials %>% group_by(participant_id) %>% summarise(
  condition            = first_value(agent_condition),
  version              = first_value(counterbalance),
  assignment           = first_value(assignment),
  study_version        = first_value(study_version),
  # Version 0.1.0 asked a strategy question and three ratings; from 0.2.0 on, the engagement questions.
  question_set         = if (any(task %in% "engagement_open")) "engagement (0.2.0+)" else "ratings (0.1.0)",
  item_best            = first_value(item_best),
  item_second          = first_value(item_second),
  participant_avatar   = first_value(participant_avatar),
  alex_avatar          = first_value(alex_avatar),
  match_item           = first_value(match_item),
  comprehension_failed = first_value(comprehension_failed),
  task_check_attempts  = sum(task == "task_check"),
  alex_check_attempts  = sum(task == "demonstrator_check"),
  completed            = any(task == "test_summary"),
  minutes              = max(num(time_elapsed), na.rm = TRUE) / 60000,
  # data quality
  focus_lost_total     = sum(num(focus_lost_count), na.rm = TRUE),
  seconds_away_total   = sum(num(focus_lost_ms), na.rm = TRUE) / 1000,
  seconds_away_demos   = sum(num(focus_lost_ms)[task == "demo"], na.rm = TRUE) / 1000,
  pasted_text          = any(num(paste_count)[task %in% c("rule_report", "engagement_open")] > 0, na.rm = TRUE),
  # post-test measures
  rank_of_best         = num(first_value(rank_of_best)),
  rank_of_second       = num(first_value(rank_of_second)),
  best_ranked_first    = rank_of_best == 1,
  ranking_correct      = as_bool(first_value(ranking_correct)),
  probe_choice         = first_value(probe_choice_item),
  probe_correct        = as_bool(first_value(probe_correct)),
  probe_confidence     = num(first_value(confidence)),
  strategy_text        = json_field(first_value(response[task == "rule_report"]), "rule"),
  # Likert answers are stored 0-6; +1 gives the 1-7 scale shown to participants
  rating_ease          = num(json_field(first_value(response[task == "ratings"]), "ease")) + 1,
  rating_expertise     = num(json_field(first_value(response[task == "ratings"]), "competence")) + 1,
  rating_similarity    = num(json_field(first_value(response[task == "ratings"]), "similarity")) + 1,
  # engagement questions (version 0.2.0 on)
  q_confusing          = first_value(q_confusing),
  q_common             = num(first_value(q_common)),          # 1 very little - 7 a lot
  q_like               = num(first_value(q_like)),            # 1 very little - 7 a lot
  q_imagine_hard       = num(first_value(q_imagine_hard)),    # 1 very easy - 7 very hard
  q_aim                = first_value(q_aim),
  q_aim_other          = first_value(q_aim_other),
  q_answers_memory     = first_value(q_answers_memory),
  q_real               = first_value(q_real),
  q_real_explain       = first_value(q_real_explain),
  q_matching_belief    = first_value(q_matching_belief),
  .groups = "drop") %>%
  left_join(per_test, by = "participant_id") %>%
  mutate(condition = factor(condition, levels = c("control", "similar", "dissimilar")),
         version = factor(version),
         # Correct memory of the similarity information depends on the condition.
         q_answers_correct = ifelse(is.na(q_answers_memory), NA,
           q_answers_memory == c(similar = "similar", dissimilar = "different", control = "not_mentioned")[as.character(condition)]))

# ---- 3. Exclusions ----------------------------------------------------------
section("2. Sample and exclusions")
cat("Failed a comprehension check (asked to return):", sum(!is.na(participants$comprehension_failed)), "\n")
cat("Did not finish for another reason:            ", sum(is.na(participants$comprehension_failed) & !participants$completed), "\n")
sample <- participants %>% filter(completed, is.na(comprehension_failed))
n0 <- nrow(sample)
if (exclude_pasted_text) sample <- sample %>% filter(!pasted_text)
sample <- sample %>% filter(seconds_away_demos <= max_seconds_away_demos)
cat("Completed:", n0, "| excluded by data-quality rules:", n0 - nrow(sample), "| analysed:", nrow(sample), "\n\n")
cat("Participants per condition and value version (balance check):\n")
print(table(condition = sample$condition, version = sample$version))
cat("\nQuestion sets at the end of the study:\n"); print(table(sample$question_set))
cat("\nHow participants were assigned (balanced = by the server; random_fallback = server unavailable):\n")
print(table(sample$assignment))
cat("\nMinutes to complete: median", round(median(sample$minutes), 1),
    "| 10th-90th percentile", paste(round(quantile(sample$minutes, c(.1, .9)), 1), collapse = "-"), "\n")
cat("Comprehension: participants needing more than one attempt -",
    "task check:", sum(sample$task_check_attempts > 1), "| Alex check:", sum(sample$alex_check_attempts > 1), "\n")

describe <- function(df, var) df %>% group_by(condition) %>%
  summarise(n = sum(!is.na(.data[[var]])), mean = mean(.data[[var]], na.rm = TRUE),
            sd = sd(.data[[var]], na.rm = TRUE), .groups = "drop") %>%
  mutate(across(c(mean, sd), ~ round(.x, 2))) %>% as.data.frame()
safe <- function(expr, what) tryCatch(expr, error = function(e) cat("  (", what, "not run: ", conditionMessage(e), ")\n", sep = ""))

# ---- 4. Manipulation check --------------------------------------------------
section("3. Manipulation check")
manip_check <- function(var, label) {
  d <- sample %>% filter(!is.na(.data[[var]]))
  if (nrow(d) == 0) return(invisible())
  cat("\n", label, "\n", sep = ""); print(describe(d, var))
  safe({ print(anova(lm(as.formula(paste(var, "~ condition")), data = d)))
         cat("Pairwise comparisons (Holm-corrected p-values):\n")
         print(pairwise.t.test(d[[var]], d$condition, p.adjust.method = "holm")) }, "test")
}
manip_check("q_common", "'How much do you feel you might have in common with Alex?' (1-7; version 0.2.0 on)")
manip_check("rating_similarity", "'How similar to you does Alex seem?' (1-7; version 0.1.0)")

# ---- 5. Main outcome: choosing the best resource on far-transfer trials -----
section("4. Main outcome: chose the BEST resource on far-transfer trials")
cat("Per-participant proportion of the 2 far trials on which the best resource was chosen:\n")
print(describe(sample, "far_best_prop"))
cat("\nCopying Alex instead (chose the second-best on far trials):\n")
print(describe(sample, "far_second_prop"))

far <- tests %>% filter(test_kind == "far") %>% inner_join(sample %>% select(participant_id, condition, version), by = "participant_id")
use_version <- if (identical(adjust_for_version, "auto")) nrow(sample) >= 40 else isTRUE(adjust_for_version)
covs <- if (use_version) " + version" else ""
cat("\nModels below", if (use_version) "are adjusted for value version." else "are not adjusted for value version (too few participants; see adjust_for_version).", "\n")
cat("\nMain model: one row per participant (far trials with the best resource, out of 2),",
    "\nlogistic regression, control condition as reference:\n")
safe({ m1 <- glm(as.formula(paste("cbind(far_best_n, far_trials - far_best_n) ~ condition", covs)), data = sample, family = binomial)
       print(round(summary(m1)$coefficients, 3))
       cat("\nOdds ratios with 95% CI:\n")
       print(round(exp(cbind(OR = coef(m1), suppressMessages(confint.default(m1)))), 2)) }, "model")

cat("\nCheck: mixed model of each far choice, with a random intercept per participant:\n")
if (requireNamespace("lme4", quietly = TRUE)) {
  safe({ m2 <- suppressWarnings(lme4::glmer(as.formula(paste("chose_best ~ condition", covs, "+ (1 | participant_id)")), data = far, family = binomial))
         co <- summary(m2)$coefficients; print(round(co, 3))
         # With only two far trials per person, many participants answer both the same way, which can make
         # this model unstable. Report the per-participant model above if so.
         if (lme4::isSingular(m2) || any(abs(co[, "Estimate"]) > 10))
           cat("Note: this model is unstable here (singular fit or extreme estimates); rely on the main model above.\n") }, "mixed model")
}

# ---- 6. Other measures ------------------------------------------------------
section("5. Near-transfer trials (copying Alex works): chose the second-best")
print(describe(sample, "near_second_prop"))

section("6. Value ranking: best resource ranked first")
print(sample %>% group_by(condition) %>% summarise(n = n(), best_ranked_first = round(mean(best_ranked_first, na.rm = TRUE), 2),
                                                   fully_correct = round(mean(ranking_correct, na.rm = TRUE), 2), .groups = "drop") %>% as.data.frame())
safe(print(suppressWarnings(chisq.test(table(sample$condition, sample$best_ranked_first)))), "chi-square")

section("7. Belief probe: 'What was Alex hoping to find?' (correct = best resource)")
print(sample %>% group_by(condition) %>% summarise(n = n(), correct = round(mean(probe_correct, na.rm = TRUE), 2),
                                                   confidence = round(mean(probe_confidence, na.rm = TRUE), 1), .groups = "drop") %>% as.data.frame())

section("8. Ratings of Alex (1-7)")
show_rating <- function(var, label) if (any(!is.na(sample[[var]]))) { cat("\n", label, "\n", sep = ""); print(describe(sample, var)) }
show_rating("q_like", "How much might you like Alex? (1 very little - 7 a lot)")
show_rating("q_imagine_hard", "How easy to imagine what Alex was thinking? (1 very EASY - 7 very HARD)")
show_rating("rating_ease", "Ease of understanding Alex's reasons (version 0.1.0)")
show_rating("rating_expertise", "Alex's expertise (version 0.1.0)")
if (sum(!is.na(sample$q_imagine_hard)) > 3) {
  cat("\nDoes finding Alex hard to imagine go with choosing the best resource less? (Spearman, all conditions)\n")
  safe(print(cor.test(sample$q_imagine_hard, sample$far_best_prop, method = "spearman", exact = FALSE)), "correlation")
}

section("8b. Engagement and beliefs (version 0.2.0 on)")
eng <- sample %>% filter(question_set != "ratings (0.1.0)")
if (nrow(eng) == 0) cat("No participants with the engagement questions yet.\n") else {
  cat("While watching, what were you mainly trying to do?\n"); print(table(condition = eng$condition, aim = eng$q_aim))
  cat("\nChose the best resource on far trials, by what they were trying to do:\n")
  print(eng %>% group_by(q_aim) %>% summarise(n = n(), far_best = round(mean(far_best_prop, na.rm = TRUE), 2), .groups = "drop") %>% as.data.frame())
  cat("\nRemembered the information about Alex's answers correctly\n(similar: 'very similar'; dissimilar: 'very different'; control: 'this wasn't mentioned'):\n")
  print(eng %>% group_by(condition) %>% summarise(n = n(), correct = round(mean(q_answers_correct, na.rm = TRUE), 2), .groups = "drop") %>% as.data.frame())
  print(table(condition = eng$condition, answer = eng$q_answers_memory))
  cat("\nDo you think Alex was a real person who had done this task before?\n"); print(table(condition = eng$condition, real = eng$q_real))
  cat("\nChose the best resource on far trials, by belief that Alex was real:\n")
  print(eng %>% group_by(q_real) %>% summarise(n = n(), far_best = round(mean(far_best_prop, na.rm = TRUE), 2), .groups = "drop") %>% as.data.frame())
  sim <- eng %>% filter(condition %in% c("similar", "dissimilar"))
  if (nrow(sim)) { cat("\nBelieved they were matched with Alex based on their answers (similar and dissimilar only):\n")
                   print(table(condition = droplevels(sim$condition), believed = sim$q_matching_belief)) }
}

section("9. Data quality (tab switches and pasting)")
print(sample %>% group_by(condition) %>% summarise(
  n = n(), any_focus_lost = sum(focus_lost_total > 0), away_during_demos = sum(seconds_away_demos > 0),
  median_seconds_away = round(median(seconds_away_total), 1), pasted_text = sum(pasted_text), .groups = "drop") %>% as.data.frame())

# ---- 7. Save and plot -------------------------------------------------------
write_csv(trials, file.path(out_dir, "trials_all.csv"))
write_csv(participants, file.path(out_dir, "participants.csv"))
# All open-ended answers in one file, for reading through.
write_csv(participants %>% select(participant_id, condition, study_version, far_best_prop, q_confusing, q_aim, q_aim_other,
                                  q_real, q_real_explain, q_matching_belief, strategy_text, comprehension_failed),
          file.path(out_dir, "open_answers.csv"))
if (requireNamespace("ggplot2", quietly = TRUE)) {
  library(ggplot2)
  plot_df <- sample %>% group_by(condition) %>%
    summarise(mean = mean(far_best_prop), se = sd(far_best_prop) / sqrt(n()), n = n(), .groups = "drop")
  g <- ggplot(plot_df, aes(condition, mean)) +
    geom_col(fill = "#7F77DD", width = 0.6) +
    geom_errorbar(aes(ymin = pmax(mean - se, 0), ymax = pmin(mean + se, 1)), width = 0.15) +
    geom_jitter(data = sample, aes(condition, far_best_prop), width = 0.12, height = 0, alpha = 0.4, inherit.aes = FALSE) +
    geom_text(aes(y = 0.03, label = paste0("n = ", n)), colour = "white", size = 3.5) +
    scale_y_continuous(limits = c(0, 1.05), labels = scales::percent) +
    labs(x = NULL, y = "Far trials: best resource chosen",
         title = "Choosing the best resource", subtitle = "Far-transfer trials; Alex never collected this resource") +
    theme_minimal(base_size = 13)
  ggsave(file.path(out_dir, "far_transfer.png"), g, width = 6, height = 4.5, dpi = 150)
}
cat("\nSaved to '", out_dir, "': trials_all.csv, participants.csv, open_answers.csv",
    if (requireNamespace("ggplot2", quietly = TRUE)) ", far_transfer.png" else "", "\n", sep = "")
