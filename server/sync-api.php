<?php
/**
 * WordPress 用户同步 API
 * 部署到旧服务器：/www/wwwroot/galaxyous.com/sync-api.php
 * 
 * 新服务器通过 HTTP 请求此接口获取用户数据
 */

// 安全密钥验证
$SECRET_KEY = 'astralinks_sync_2024_secret';

// 检查密钥
$providedKey = $_GET['key'] ?? $_SERVER['HTTP_X_SYNC_KEY'] ?? '';
if ($providedKey !== $SECRET_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// 数据库配置
$dbHost = 'localhost';
$dbName = 'galaxyous_com';
$dbUser = 'galaxyous_com';
$dbPass = 'C8ypSNwR41J1BdNa';

header('Content-Type: application/json');

try {
    $pdo = new PDO(
        "mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4",
        $dbUser,
        $dbPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    
    // 获取所有用户
    $stmt = $pdo->query('SELECT ID, user_login, user_email FROM wp_users');
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'count' => count($users),
        'users' => $users,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Database error',
        'message' => $e->getMessage()
    ]);
}
