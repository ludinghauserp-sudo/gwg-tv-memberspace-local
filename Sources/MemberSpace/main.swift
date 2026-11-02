import AppKit
import WebKit
import LocalCore
final class AppDelegate:NSObject,NSApplicationDelegate,WKNavigationDelegate,WKUIDelegate,WKDownloadDelegate,WKScriptMessageHandler {
 var window:NSWindow!,web:WKWebView!,server:LocalHTTPServer?
 let data=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("GWG TV Member Space")
 func applicationDidFinishLaunching(_ notification:Notification){
  let config=WKWebViewConfiguration();config.preferences.javaScriptCanOpenWindowsAutomatically=true
  config.userContentController.add(self,name:"native")
  config.userContentController.addUserScript(WKUserScript(source:"window.print=()=>window.webkit.messageHandlers.native.postMessage('print');",injectionTime:.atDocumentStart,forMainFrameOnly:true))
  web=WKWebView(frame:.zero,configuration:config);web.navigationDelegate=self;web.uiDelegate=self
  window=NSWindow(contentRect:NSRect(x:0,y:0,width:1280,height:820),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false);window.title="GWG TV · Member Space";window.minSize=NSSize(width:780,height:560);window.contentView=web;window.center();window.makeKeyAndOrderFront(nil)
  buildMenu()
  do{guard let resources=Bundle.main.resourceURL else{return};let local=try LocalHTTPServer(root:resources.appendingPathComponent("www"),dataRoot:data);server=local;local.onReady={[weak self] url in DispatchQueue.main.async{self?.web.load(URLRequest(url:url));NSApp.activate(ignoringOtherApps:true)}};local.onFailure={[weak self] message in DispatchQueue.main.async{self?.showError(message);NSApp.terminate(nil)}};try local.start(port:8766)}catch{showError(error.localizedDescription)}
 }
 func buildMenu(){let menu=NSMenu();let appItem=NSMenuItem();menu.addItem(appItem);let appMenu=NSMenu();appMenu.addItem(withTitle:"About GWG TV Member Space",action:#selector(about),keyEquivalent:"");appMenu.addItem(.separator());appMenu.addItem(withTitle:"Show Local Data Folder",action:#selector(revealData),keyEquivalent:"");appMenu.addItem(.separator());appMenu.addItem(withTitle:"Quit GWG TV Member Space",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q");appItem.submenu=appMenu
  let editItem=NSMenuItem();menu.addItem(editItem);let edit=NSMenu(title:"Edit");for (title,action,key) in [("Undo","undo:","z"),("Redo","redo:","Z"),("Cut","cut:","x"),("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a")]{edit.addItem(withTitle:title,action:Selector(action),keyEquivalent:key)};editItem.submenu=edit
  let viewItem=NSMenuItem();menu.addItem(viewItem);let view=NSMenu(title:"View");view.addItem(withTitle:"Member Space Home",action:#selector(home),keyEquivalent:"h");view.addItem(withTitle:"Back",action:#selector(back),keyEquivalent:"[");view.addItem(withTitle:"Forward",action:#selector(forward),keyEquivalent:"]");view.addItem(withTitle:"Reload",action:#selector(reload),keyEquivalent:"r");view.addItem(withTitle:"Print",action:#selector(printPage),keyEquivalent:"p");viewItem.submenu=view;NSApp.mainMenu=menu
 }
 @objc func about(){let a=NSAlert();a.messageText="GWG TV Member Space";a.informativeText="Local Edition 1.0\nNative Swift server + the GWG TV web interface.\nNo Node.js, login or cloud database required.\nData: "+data.path;a.runModal()}
 @objc func revealData(){try? FileManager.default.createDirectory(at:data,withIntermediateDirectories:true);NSWorkspace.shared.open(data)}
 @objc func home(){if let origin=server?.origin,let url=URL(string:origin+"/members"){web.load(URLRequest(url:url))}}
 @objc func back(){web.goBack()}
 @objc func forward(){web.goForward()}
 @objc func reload(){web.reload()}
 @objc func printPage(){let info=NSPrintInfo.shared;let operation=web.printOperation(with:info);operation.showsPrintPanel=true;operation.showsProgressPanel=true;operation.run()}
 func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){if message.body as? String=="print"{printPage()}}
 func showError(_ text:String){let alert=NSAlert();alert.messageText="GWG TV could not open";alert.informativeText=text;alert.runModal()}
 func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{true}
 func applicationWillTerminate(_ notification:Notification){server?.stop()}
 func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){if navigationAction.shouldPerformDownload{decisionHandler(.download);return};if let url=navigationAction.request.url,["https","http"].contains(url.scheme ?? ""),url.host != "127.0.0.1"{NSWorkspace.shared.open(url);decisionHandler(.cancel);return};decisionHandler(.allow)}
 func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload){download.delegate=self}
 func webView(_ webView:WKWebView,navigationResponse:WKNavigationResponse,didBecome download:WKDownload){download.delegate=self}
 func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping(URL?)->Void){let save=NSSavePanel();save.nameFieldStringValue=(suggestedFilename as NSString).lastPathComponent;save.canCreateDirectories=true;save.beginSheetModal(for:window){result in completionHandler(result == .OK ? save.url:nil)}}
 func webView(_ webView:WKWebView,createWebViewWith configuration:WKWebViewConfiguration,for navigationAction:WKNavigationAction,windowFeatures:WKWindowFeatures)->WKWebView?{if let url=navigationAction.request.url{NSWorkspace.shared.open(url)};return nil}
 func webView(_ webView:WKWebView,runOpenPanelWith parameters:WKOpenPanelParameters,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping([URL]?)->Void){let panel=NSOpenPanel();panel.canChooseFiles=true;panel.canChooseDirectories=parameters.allowsDirectories;panel.allowsMultipleSelection=parameters.allowsMultipleSelection;panel.beginSheetModal(for:window){result in completionHandler(result == .OK ? panel.urls:nil)}}
 func webView(_ webView:WKWebView,runJavaScriptConfirmPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping(Bool)->Void){let a=NSAlert();a.messageText="GWG TV Member Space";a.informativeText=message;a.addButton(withTitle:"Continue");a.addButton(withTitle:"Cancel");a.beginSheetModal(for:window){completionHandler($0 == .alertFirstButtonReturn)}}
 func webView(_ webView:WKWebView,runJavaScriptAlertPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping()->Void){let a=NSAlert();a.messageText="GWG TV Member Space";a.informativeText=message;a.beginSheetModal(for:window){_ in completionHandler()}}
 func webView(_ webView:WKWebView,requestMediaCapturePermissionFor origin:WKSecurityOrigin,initiatedByFrame frame:WKFrameInfo,type:WKMediaCaptureType,decisionHandler:@escaping(WKPermissionDecision)->Void){decisionHandler(origin.host=="127.0.0.1" ? .prompt:.deny)}
}
let app=NSApplication.shared
let delegate=AppDelegate()
app.setActivationPolicy(.regular)
app.delegate=delegate
app.run()
