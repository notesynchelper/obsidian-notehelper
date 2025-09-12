mkdir "obsidian-omnivore-local-test"
copy "obsidian-plug\obsidian-omnivore\main.js" "obsidian-omnivore-local-test\"
copy "obsidian-plug\obsidian-omnivore\manifest.json" "obsidian-omnivore-local-test\"
copy "obsidian-plug\obsidian-omnivore\styles.css" "obsidian-omnivore-local-test\"

echo "插件文件已准备完毕！"
echo "请将 'obsidian-omnivore-local-test' 文件夹复制到以下路径："
echo "Windows: %%APPDATA%%\Obsidian\plugins\"
echo "或者手动复制到你的Obsidian插件目录"
echo ""
echo "Mock服务器正在运行在 http://localhost:3001"
echo "完成后重启Obsidian并启用插件即可开始测试！"

pause