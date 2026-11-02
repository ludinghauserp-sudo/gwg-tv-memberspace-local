import Foundation
import LocalCore
let args=CommandLine.arguments
func argument(_ name:String,_ fallback:String)->String{if let i=args.firstIndex(of:name),i+1<args.count{return args[i+1]};return fallback}
let base=URL(fileURLWithPath:FileManager.default.currentDirectoryPath)
let root=URL(fileURLWithPath:argument("--root",base.appendingPathComponent("www").path))
let data=URL(fileURLWithPath:argument("--data",base.appendingPathComponent("Data").path))
do{let server=try LocalHTTPServer(root:root,dataRoot:data);server.onReady={url in if args.contains("--open"){let p=Process();p.executableURL=URL(fileURLWithPath:"/usr/bin/open");p.arguments=[url.absoluteString];try? p.run()}};server.onFailure={message in fputs(message+"\n",stderr);exit(1)};try server.start(port:UInt16(argument("--port","8765")) ?? 8765);withExtendedLifetime(server){dispatchMain()}}catch{fputs("Could not start GWG TV: \(error)\n",stderr);exit(1)}
