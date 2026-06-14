<?php
// Simple deploy webhook — called by GitHub Actions via HTTPS POST
// Place this file in your home directory (public_html parent), NOT in public_html

$SECRET = getenv('DEPLOY_SECRET');  // set as env var, or hardcode below
if (!$SECRET) {
    // Fallback: hardcode here if env var not available
    $SECRET = 'QfyurqbZE30KL5WeGxYhPD6jMXO2ilHA';
}

// Verify secret token from header
$token = $_SERVER['HTTP_X_DEPLOY_TOKEN'] ?? '';
if (!hash_equals($SECRET, $token)) {
    http_response_code(403);
    echo 'Forbidden';
    exit;
}

// Run git pull
$repo_path = escapeshellarg(__DIR__);
$output = shell_exec("cd {$repo_path} && git pull origin master 2>&1");

// Touch Passenger restart file
$restart = __DIR__ . '/tmp/restart.txt';
if (!is_dir(__DIR__ . '/tmp')) mkdir(__DIR__ . '/tmp', 0755, true);
touch($restart);

echo "OK\n" . htmlspecialchars($output);
